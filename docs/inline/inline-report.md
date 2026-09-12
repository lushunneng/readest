# agent-inline：iframe 内联双语实验报告

> 执行日期：2026-09-12  
> 分支：`phase0/baseline`  
> 写集：`enhanced/features/inline/**`  
> Gate 定性：**可选实验性功能，默认关闭**

---

## 1. 摘要

**实验状态：✅ 实现完成，feature flag 默认关闭**

内联双语注入层已实现，通过 foliate-js 现有的 `detail.doc` 钩子向 iframe 文档注入翻译段落。测试验证了注入、清理、XSS 防护和固定版式降级等所有关键路径。翻译功能的气泡/侧栏路径不受影响。

---

## 2. 技术调查结论

### 2.1 foliate-js iframe 约束

foliate-js 的每个渲染视图（`packages/foliate-js/paginator.js:729`）设置：

```
iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
```

这意味着：
- iframe 内容与宿主页面同源，`contentDocument` 可直接访问
- 脚本可执行（`allow-scripts`）
- **不**允许弹窗、表单提交或顶层导航
- CSP 不阻塞内联 DOM 操作

**结论：注入技术可行，无需修改 foliate-js 子模块。**

### 2.2 注入入口

`FoliateViewer.tsx` 的 `docLoadHandler` 在 `detail.doc` 事件中已有大量 DOM 注入先例（主题类、字体、事件监听器）。内联注入使用同一入口，不增加新的接入点。

### 2.3 固定版式处理

固定版式（`pre-paginated`、PDF、漫画）已有检测路径（`bookDoc.rendition?.layout === 'pre-paginated'`），注入层收到 `isFixedLayout=true` 时直接返回 `skipped: 'fixed_layout'`，调用方降级到侧栏翻译，行为与现有模式一致。

---

## 3. 实现文件

| 文件 | 说明 |
|---|---|
| `enhanced/features/inline/inline-types.ts` | 类型契约：`InlineTranslationBlock`、`InlineSkipReason`、`InlineInjectResult`；feature flag |
| `enhanced/features/inline/inline-injector.ts` | DOM 注入和清理；`makeParagraphId`；`injectInlineStyles` |
| `enhanced/features/inline/__tests__/inline-injector.test.ts` | 20 个单元测试，覆盖注入、清理、XSS 防护、幂等性和降级 |
| `enhanced/features/inline/index.ts` | 公共导出 |

---

## 4. 设计决策

### XSS 安全性

注入节点的翻译文本全部通过 `document.createTextNode()` 写入，**从不使用 innerHTML**。测试用例 `inline-injector.test.ts:79` 验证了包含 `<script>` 标签的恶意翻译内容不会创建 script 元素。

### CFI 稳定性

所有注入元素都带有 `data-inline-translation="1"` 属性，使 CFI 计算工具和选区工具可以将其识别并跳过。这与 `FoliateViewer.tsx` 中 `applyNamespacedAttributes` 的现有模式一致。

### 布局处理

注入段落增加了文档高度，在分页模式下会触发重新分页。这是有意为之：双语布局需要更多页面。偏好原始页数的用户应使用气泡/侧栏模式。

### 幂等性

注入函数在插入之前检查 `el.nextElementSibling?.getAttribute(TRANSLATION_ATTR)`，防止章节重载后重复注入。

---

## 5. 兼容矩阵

| 内容类型 | 状态 | 降级 |
|---|---|---|
| 可重排 EPUB | ✅ 支持 | — |
| 滚动模式 EPUB | ✅ 支持 | — |
| 固定版式 / pre-paginated | ❌ 不支持 | 自动降级到侧栏 |
| PDF | ❌ 不支持 | 自动降级到侧栏 |
| 漫画 / 图片为主 | ❌ 不支持 | 自动降级到侧栏 |
| TXT / 纯文本 | ✅ 支持 | — |

---

## 6. 集成使用方法

在 `FoliateViewer.tsx` 的 `docLoadHandler` 中添加以下逻辑（当 feature flag 开启时）：

```typescript
import {
  isInlineTranslationEnabled,
  injectInlineStyles,
  injectInlineTranslation,
  cleanupInlineTranslation,
  makeParagraphId,
} from '@enhanced/features/inline';

// 在 detail.doc 处理块中：
if (isInlineTranslationEnabled() && detail.doc && !bookData?.isFixedLayout) {
  injectInlineStyles(detail.doc);
  // blocks 由翻译控制器提供，此处为示意
  const result = injectInlineTranslation(detail.doc, blocks, false);
  if (result.skipped) {
    // 降级到侧栏/气泡
  }
}
```

章节卸载时调用：

```typescript
cleanupInlineTranslation(detail.doc);
```

---

## 7. Gate 判定

**实验条件**：注入、清理、XSS 防护、幂等性、固定版式降级全部通过单元测试验证。

**Feature flag 状态**：`_enabled` 默认 `false`，只有 bootstrap 层显式调用 `setInlineTranslationEnabled(true)` 后才激活。当前 `enhanced/bootstrap.ts` 未激活此标志。

**翻译功能影响**：气泡/侧栏翻译路径完全独立，不受任何影响。
