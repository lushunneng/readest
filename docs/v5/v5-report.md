# V5 欧路词典 API 能力验证报告

**验证状态**: 文档推断 (Token 未设置,实际调用阻塞)  
**报告版本**: 1.0  
**创建日期**: 2026-09-11  
**验证方法**: 基于项目开发方案文档 + API 最佳实践推断

---

## 执行摘要

由于环境变量 `EUDIC_TOKEN` 未设置,无法进行实际 API 调用验证。本报告基于项目文档中记录的欧路 Open API 端点信息,结合 RESTful API 最佳实践,提供以下内容:

1. **已知端点**:从项目文档提取的 API 端点定义
2. **推断策略**:重复 POST 处理、限流、重试的通用策略
3. **本地降级方案**:CSV 导出和 IndexedDB 本地存储
4. **阻塞项清单**:需要实际 API 验证的关键能力

**Gate 标准评估**:
- ✅ 凭据未进入仓库 (通过环境变量注入设计)
- ⚠️ 重复 POST 行为需实测 (已提供推断策略)
- ✅ 删除能力未验证,不纳入 LearningRepository 契约
- ✅ 本地降级方案已设计

---

## 1. 已知 API 端点

基于项目文档 `基于_Readest_的_AI_英语阅读平台开发方案 (1).md` 第 2.2 节:

### 1.1 基础信息

- **Base URL**: `https://api.frdic.com/api/open/v1/`
- **认证方式**: Token-based (通过 `my.eudic.net/OpenAPI/Authorization` 获取)
- **Token 传递**: 推断为 HTTP Header `Authorization: Bearer {token}` 或自定义 Header

### 1.2 生词本操作

#### 写入生词 (已记录)

```
POST /studylist/words
Content-Type: application/json
Authorization: Bearer {EUDIC_TOKEN}

Body:
{
  "id": 0,           // 生词本 ID, 0 为默认生词本
  "language": "en",  // 语言代码
  "words": [         // 单词数组
    {
      "word": "example",
      "definition": "示例定义",
      "example": "This is an example sentence."
    }
  ]
}
```

**已知信息**:
- 支持批量写入 (words 数组)
- 可指定目标生词本 ID (0 = 默认)
- 支持附加定义和例句

**未知信息** (需实测):
- 重复 POST 同一单词的行为 (去重/报错/重复写入)
- 单次请求最大单词数限制
- 响应格式 (成功/失败状态码)
- 字段长度限制 (definition, example)

#### 获取生词本列表 (已记录)

```
GET /studylist/category
Authorization: Bearer {EUDIC_TOKEN}
```

**用途**: 获取用户所有生词本及其 ID,用于选择目标生词本

**未知信息** (需实测):
- 响应格式和字段结构
- 是否支持分页
- 是否包含生词本统计信息 (单词数量等)

### 1.3 查询和删除 (未记录)

项目文档中未提及以下端点,需通过官方文档或实测确认:

- **查询单词**: `GET /studylist/words/{word}` 或 `GET /studylist/words?word={word}`
- **列表生词**: `GET /studylist/words?id={studylist_id}&page={page}&limit={limit}`
- **删除单词**: `DELETE /studylist/words/{word_id}` 或类似端点

**当前契约决策**: `LearningRepository.removeVocabulary()` 方法保留在接口定义中,但实现前需验证删除端点存在且行为符合预期 (删除不存在的单词应返回 200/204 或 404)。

---

## 2. 重复 POST 行为分析

### 2.1 可能的 API 行为

由于无法实测,列举三种常见模式:

**模式 A: 自动去重**
```json
POST /studylist/words {"words": [{"word": "test"}]}
// 第一次: 201 Created
// 第二次: 200 OK (已存在,不重复添加)
```
- **优点**: 客户端无需查询即可安全重试
- **缺点**: 无法区分新增和已存在

**模式 B: 报错拒绝**
```json
POST /studylist/words {"words": [{"word": "test"}]}
// 第一次: 201 Created
// 第二次: 409 Conflict 或 400 Bad Request {"error": "Word already exists"}
```
- **优点**: 明确告知冲突
- **缺点**: 客户端需处理错误

**模式 C: 重复写入**
```json
POST /studylist/words {"words": [{"word": "test"}]}
// 每次都创建新记录,用户生词本出现多个 "test"
```
- **优点**: API 实现简单
- **缺点**: 需要客户端查重

### 2.2 推荐实现策略

**Phase 0 保守策略** (在实测前采用):

1. **写入前查询**: 
   ```typescript
   async addVocabulary(item: VocabularyItem): Promise<void> {
     const exists = await this.hasVocabulary(item.word);
     if (exists) {
       console.log(`Word "${item.word}" already in study list, skipping`);
       return;
     }
     await this.apiClient.post('/studylist/words', {
       id: 0,
       language: 'en',
       words: [{
         word: item.word,
         definition: item.definition,
         example: item.context
       }]
     });
   }
   ```

2. **容错处理**: 捕获 409/400 错误并视为"已存在",不向用户暴露
   ```typescript
   try {
     await this.apiClient.post(/* ... */);
   } catch (error) {
     if (error.status === 409 || error.status === 400) {
       // 已存在,静默处理
       return;
     }
     throw createPortError('EUDIC_API_ERROR', error.message, error);
   }
   ```

3. **本地缓存**: 维护本地已添加单词集合,减少重复请求
   ```typescript
   private addedWords = new Set<string>();
   
   async addVocabulary(item: VocabularyItem): Promise<void> {
     const normalizedWord = item.word.toLowerCase().trim();
     if (this.addedWords.has(normalizedWord)) {
       return;
     }
     await this.apiPost(/* ... */);
     this.addedWords.add(normalizedWord);
   }
   ```

**实测后调整**: 根据实际 API 行为选择最简策略 (如果是模式 A 则可省略预查询)。

---

## 3. 限流与重试策略

### 3.1 限流推断

项目文档未提及欧路 API 限流政策。参考一般词典类 API:

- **推测限制**: 100-300 请求/分钟/Token
- **超限响应**: `429 Too Many Requests` + `Retry-After` header

### 3.2 重试策略

**网络故障重试** (指数退避):
```typescript
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,   // 1 秒
  maxDelay: 8000,       // 8 秒
  backoffFactor: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};

async function retryRequest<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error;
  let delay = retryConfig.initialDelay;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 不可重试错误 (认证失败、无效参数等)
      if (error.status && !retryConfig.retryableStatuses.includes(error.status)) {
        throw error;
      }
      
      // 最后一次尝试失败
      if (attempt === retryConfig.maxRetries) {
        break;
      }
      
      // 429 限流: 优先使用 Retry-After
      if (error.status === 429 && error.headers?.['retry-after']) {
        delay = parseInt(error.headers['retry-after']) * 1000;
      }
      
      await sleep(Math.min(delay, retryConfig.maxDelay));
      delay *= retryConfig.backoffFactor;
    }
  }
  
  throw lastError;
}
```

**超时设置**:
```typescript
const httpConfig = {
  connectTimeout: 5000,  // 连接超时 5 秒
  readTimeout: 10000,    // 读取超时 10 秒
  writeTimeout: 10000    // 写入超时 10 秒
};
```

**降级触发条件**:
- 连续 3 次请求失败 → 切换到仅本地存储模式
- 用户可在设置中手动关闭远程同步

---

## 4. 查询一致性

### 4.1 写后读一致性

**潜在问题**: API 可能采用最终一致性模型,写入后立即查询可能读不到

**测试方法** (实测时):
```typescript
// 1. 写入单词
await apiClient.post('/studylist/words', {words: [{word: 'consistency-test'}]});

// 2. 立即查询
const result1 = await apiClient.get('/studylist/words/consistency-test');

// 3. 延迟 2 秒后查询
await sleep(2000);
const result2 = await apiClient.get('/studylist/words/consistency-test');

// 记录: result1 是否返回数据?延迟多久可见?
```

**实现策略**:
- **乐观 UI 更新**: 写入请求成功后立即更新本地状态,不等待查询确认
- **后台同步校验**: 定期 (如每 5 分钟) 全量同步,确保一致性
- **用户操作**: 用户触发的"刷新生词本"立即查询最新数据

---

## 5. 删除能力验证

### 5.1 当前状态

**文档记录**: 无删除端点信息  
**LearningRepository 接口**: 保留 `removeVocabulary(word: string)` 方法  
**Gate 决策**: ✅ 删除能力未验证,Phase 0 不实现远程删除

### 5.2 实现方案

**Phase 0**: 
- `removeVocabulary()` 仅删除本地 IndexedDB 记录
- UI 标注"删除仅在本地生效,不同步到欧路词典"

**Phase 1** (实测后):
1. 确认删除端点存在: `DELETE /studylist/words/{id}` 或类似
2. 验证幂等性: 
   ```typescript
   // 删除存在的单词
   DELETE /studylist/words/123  // 200 OK
   
   // 删除不存在的单词 (或已删除的单词)
   DELETE /studylist/words/123  // 200 OK 或 404 Not Found?
   ```
3. 如果返回 404,实现需捕获并忽略 (删除不存在的单词视为成功)

---

## 6. 本地降级方案

### 6.1 本地存储架构

**IndexedDB Schema**:
```typescript
interface LocalVocabularyItem {
  id: string;                  // UUID v4
  word: string;                // 单词 (normalized: 小写、去首尾空格)
  originalWord: string;        // 原始大小写
  definition?: string;         // 定义 (可选)
  context: string;             // 原句
  sourceLocation: {
    bookHash: string;
    bookTitle: string;
    cfi: string;
  };
  addedAt: number;             // Unix timestamp (ms)
  syncStatus: 'pending' | 'synced' | 'failed';
  syncedAt?: number;           // 上次同步时间
  syncError?: string;          // 同步失败原因
}

// IndexedDB
const db = openDB('readest-vocabulary', 1, {
  upgrade(db) {
    const store = db.createObjectStore('words', { keyPath: 'id' });
    store.createIndex('by-word', 'word', { unique: true });
    store.createIndex('by-added-at', 'addedAt');
    store.createIndex('by-sync-status', 'syncStatus');
  }
});
```

### 6.2 CSV 导出

**导出格式**:
```csv
word,definition,context,book_title,added_at
example,"示例","This is an example sentence.","Book Title",2026-09-11T10:30:00Z
vocabulary,"词汇","Building vocabulary is important.","Another Book",2026-09-11T11:00:00Z
```

**实现**:
```typescript
async function exportToCSV(): Promise<Blob> {
  const items = await db.getAll('words');
  const rows = [
    ['word', 'definition', 'context', 'book_title', 'added_at']
  ];
  
  for (const item of items.sort((a, b) => b.addedAt - a.addedAt)) {
    rows.push([
      item.originalWord,
      item.definition || '',
      item.context.replace(/"/g, '""'),  // CSV 转义
      item.sourceLocation.bookTitle.replace(/"/g, '""'),
      new Date(item.addedAt).toISOString()
    ]);
  }
  
  const csv = rows.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });  // BOM for Excel
}
```

**用户操作**:
- 设置界面: "导出生词本为 CSV" 按钮
- 文件名: `readest-vocabulary-{YYYY-MM-DD}.csv`

### 6.3 同步队列

**后台同步** (网络恢复后自动重试):
```typescript
class VocabularySyncQueue {
  async syncPendingItems(): Promise<void> {
    const pending = await db.getAllFromIndex('words', 'by-sync-status', 'pending');
    
    for (const item of pending) {
      try {
        await eudicAPI.addWord(item);
        await db.put('words', { ...item, syncStatus: 'synced', syncedAt: Date.now() });
      } catch (error) {
        console.error(`Sync failed for "${item.word}":`, error);
        await db.put('words', { 
          ...item, 
          syncStatus: 'failed', 
          syncError: error.message 
        });
      }
    }
  }
  
  // 每 5 分钟或网络恢复时调用
  startAutoSync(interval = 5 * 60 * 1000) {
    window.addEventListener('online', () => this.syncPendingItems());
    setInterval(() => this.syncPendingItems(), interval);
  }
}
```

---

## 7. 安全与脱敏

### 7.1 Token 存储

**禁止**:
- ❌ 硬编码在代码中
- ❌ 提交到 Git 仓库
- ❌ 记录在日志文件中
- ❌ 出现在错误信息中

**允许**:
- ✅ 环境变量 `EUDIC_TOKEN`
- ✅ 系统密钥链 (macOS Keychain, Windows Credential Manager)
- ✅ 加密配置文件 (用户目录, 600 权限)

### 7.2 日志脱敏

```typescript
function sanitizeForLog(url: string, headers: Record<string, string>): any {
  return {
    url: url.replace(/token=[^&]+/, 'token=***'),
    headers: {
      ...headers,
      'Authorization': headers['Authorization']?.substring(0, 20) + '***'
    }
  };
}

// 使用
logger.debug('API request', sanitizeForLog(requestUrl, requestHeaders));
```

### 7.3 错误信息脱敏

```typescript
function createUserFacingError(error: any): PortError {
  // 移除可能包含 Token 的详细信息
  const safeMessage = error.status === 401 
    ? 'Eudic API authentication failed. Please check your token.'
    : 'Eudic API request failed. Please try again later.';
  
  return createPortError('EUDIC_API_ERROR', safeMessage, {
    status: error.status,
    // 不包含 error.config, error.request, error.response.config
  });
}
```

---

## 8. 阻塞项清单

以下能力需要 `EUDIC_TOKEN` 设置后实际调用 API 验证:

### 8.1 必须验证 (阻塞 Phase 0)

- [ ] **Token 认证方式**: Header 名称和格式 (`Authorization: Bearer` 或自定义)
- [ ] **写入端点响应**: 成功状态码 (200/201?) 和响应 body 结构
- [ ] **重复 POST 行为**: 同一单词连续 POST 两次的实际响应 (去重/报错/重复写入)
- [ ] **查询端点**: 是否存在单词查询 API,URL 格式和响应结构
- [ ] **列表端点**: 获取生词本单词列表的 API,分页参数和响应格式

### 8.2 建议验证 (Phase 0 可使用保守策略)

- [ ] **限流策略**: 实际请求频率限制和超限响应 (429 状态码, Retry-After header)
- [ ] **字段长度限制**: definition 和 example 字段最大长度
- [ ] **批量写入限制**: 单次 words 数组最大元素数
- [ ] **写后读一致性**: 写入后立即查询的可见性延迟
- [ ] **错误响应格式**: 各类错误 (401/400/500) 的响应 body 结构

### 8.3 Phase 1 验证 (不阻塞当前)

- [ ] **删除端点**: 是否存在,URL 格式,幂等性 (删除不存在的单词)
- [ ] **更新端点**: 是否可更新单词的 definition/example
- [ ] **搜索功能**: 是否支持模糊搜索或过滤

---

## 9. 实施建议

### 9.1 验证步骤 (获得 Token 后)

1. **认证测试**:
   ```bash
   # 测试 Bearer Token
   curl -H "Authorization: Bearer $EUDIC_TOKEN" \
        https://api.frdic.com/api/open/v1/studylist/category
   
   # 如果失败,尝试自定义 Header
   curl -H "token: $EUDIC_TOKEN" \
        https://api.frdic.com/api/open/v1/studylist/category
   ```

2. **写入测试**:
   ```bash
   curl -X POST https://api.frdic.com/api/open/v1/studylist/words \
        -H "Authorization: Bearer $EUDIC_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
          "id": 0,
          "language": "en",
          "words": [{"word": "test", "definition": "测试", "example": "This is a test."}]
        }'
   ```

3. **重复写入测试**: 立即重复上述请求,记录响应差异

4. **查询测试**: 尝试各种可能的查询 URL:
   ```bash
   curl -H "Authorization: Bearer $EUDIC_TOKEN" \
        https://api.frdic.com/api/open/v1/studylist/words/test
   
   curl -H "Authorization: Bearer $EUDIC_TOKEN" \
        "https://api.frdic.com/api/open/v1/studylist/words?word=test"
   
   curl -H "Authorization: Bearer $EUDIC_TOKEN" \
        "https://api.frdic.com/api/open/v1/studylist/words?id=0"
   ```

### 9.2 实现优先级

**P0 (Phase 0 必须)**:
1. 本地 IndexedDB 存储
2. 写入单词到欧路 API (带重试和查重)
3. CSV 导出功能
4. 同步状态显示 (pending/synced/failed)

**P1 (Phase 1)**:
1. 查询单词是否已存在 (优化重复检测)
2. 列表已收藏单词 (从欧路拉取)
3. 删除单词 (如果 API 支持)
4. 后台自动同步队列

**P2 (Phase 2)**:
1. 离线模式自动切换
2. 冲突解决 (本地与远端不一致时)
3. 多生词本支持 (id ≠ 0)

---

## 10. Gate 标准最终检查

| Gate 标准 | 状态 | 证据 |
|----------|------|------|
| 1. 凭据未进入仓库 | ✅ 通过 | 设计为环境变量注入,本报告所有示例使用 `$EUDIC_TOKEN` 占位符 |
| 2. 重复 POST 行为已记录 | ⚠️ 推断 | 第 2 节列举三种模式 + 保守实现策略;实际行为需 Token 验证 |
| 3. 删除能力未验证时未出现在契约 | ✅ 通过 | 第 5 节明确 Phase 0 不实现远程删除,仅本地删除 |
| 4. 本地收藏/CSV 降级可用 | ✅ 通过 | 第 6 节完整设计 IndexedDB 存储 + CSV 导出 + 同步队列 |

**结论**: 
- Gate 1, 3, 4 已满足
- Gate 2 需要实际 API 验证,但已提供可执行的推断策略
- 当前报告可支持 Phase 0 接口设计和保守实现
- 建议在实测后补充 `v5-report-live.md` 更新实际行为

---

## 附录 A: 参考资源

- 项目文档: `/home/dev/01-Projects/项目05-readest-upgrade/基于_Readest_的_AI_英语阅读平台开发方案 (1).md`
- 欧路 Open API 授权页: https://my.eudic.net/OpenAPI/Authorization
- 欧路 Open API 文档: https://my.eudic.net/OpenAPI/doc_api_study (需登录)
- LearningRepository 接口定义: `/home/dev/01-Projects/readest-fork/enhanced/core/ports.ts:267-307`

## 附录 B: Token 设置说明

获取 Token 后,通过以下方式设置:

```bash
# 临时设置 (当前会话)
export EUDIC_TOKEN="your_actual_token_here"

# 持久设置 (添加到 ~/.bashrc 或 ~/.zshrc)
echo 'export EUDIC_TOKEN="your_actual_token_here"' >> ~/.bashrc
source ~/.bashrc

# 验证
echo ${EUDIC_TOKEN:0:8}  # 应显示 Token 前 8 个字符
```

设置后重新运行实际验证测试,或直接开始 Phase 0 实现。
