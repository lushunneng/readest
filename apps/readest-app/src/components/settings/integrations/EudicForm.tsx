import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import {
  EudicApiClient,
  EudicCategory,
} from '../../../../../../enhanced/features/eudic/eudic-api-client';
import {
  clearStoredEudicToken,
  getStoredEudicToken,
  setStoredEudicToken,
} from '../../../../../../enhanced/features/eudic/token-storage';
import {
  getStoredEudicCategoryId,
  getStoredEudicAutoAdd,
  setStoredEudicCategoryId,
  setStoredEudicAutoAdd,
} from '../../../../../../enhanced/features/eudic/wordbook-storage';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import SubPageHeader from '../SubPageHeader';
import { SectionTitle } from '../primitives';

interface EudicFormProps {
  onBack: () => void;
}

const EudicForm: React.FC<EudicFormProps> = ({ onBack }) => {
  const _ = useTranslation();
  const [configured, setConfigured] = useState(() => !!getStoredEudicToken());
  const [token, setToken] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [categories, setCategories] = useState<EudicCategory[]>([]);
  const [categoryId, setCategoryId] = useState(() => getStoredEudicCategoryId());
  const [autoAdd, setAutoAdd] = useState(() => getStoredEudicAutoAdd());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const loadCategories = async (tokenValue: string) => {
    setIsLoadingCategories(true);
    try {
      const next = await new EudicApiClient(tokenValue).listCategories();
      setCategories(next);
      const saved = getStoredEudicCategoryId();
      const selected = next.some((item) => item.id === saved) ? saved : next[0]?.id || '0';
      setCategoryId(selected);
      setStoredEudicCategoryId(selected);
    } catch {
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    const storedToken = getStoredEudicToken();
    if (storedToken) void loadCategories(storedToken);
  }, []);

  const handleSave = async () => {
    const normalized = token.trim();
    if (!normalized) return;
    setStoredEudicToken(normalized);
    const client = new EudicApiClient(normalized);
    setIsChecking(true);
    try {
      await client.checkConnection();
      setConfigured(true);
      void loadCategories(normalized);
      eventDispatcher.dispatch('toast', { message: _('Eudic token saved'), type: 'success' });
      setToken('');
    } catch (error) {
      const isAuthFailure = (error as { code?: string }).code === 'AUTH_FAILED';
      if (isAuthFailure) clearStoredEudicToken();
      eventDispatcher.dispatch('toast', {
        message: isAuthFailure
          ? _('Eudic token is invalid')
          : _('Token saved locally, but Eudic could not be reached for verification.'),
        type: isAuthFailure ? 'error' : 'info',
      });
      if (!isAuthFailure) setToken('');
    } finally {
      setIsChecking(false);
    }
  };

  const handleClear = () => {
    clearStoredEudicToken();
    setToken('');
    setConfigured(false);
    setCategories([]);
    eventDispatcher.dispatch('toast', { message: _('Eudic token cleared'), type: 'info' });
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    const storedToken = getStoredEudicToken();
    if (!name || !storedToken) return;
    try {
      const created = await new EudicApiClient(storedToken).createCategory(name);
      setCategories((current) => [...current, created]);
      setCategoryId(created.id);
      setStoredEudicCategoryId(created.id);
      setNewCategoryName('');
      eventDispatcher.dispatch('toast', { message: _('Wordbook created'), type: 'success' });
    } catch {
      eventDispatcher.dispatch('toast', { message: _('Could not create wordbook'), type: 'error' });
    }
  };

  return (
    <div className='w-full'>
      <SubPageHeader
        parentLabel={_('Integrations')}
        currentLabel={_('Eudic')}
        description={_(
          'Enter your Eudic Open API token. It stays on this device and is never included in synced settings.',
        )}
        onBack={onBack}
      />
      <div className='space-y-5 px-4'>
        <div className='space-y-1.5'>
          <SectionTitle as='label' htmlFor='eudic-token' className='block'>
            {_('Open API Token')}
          </SectionTitle>
          <input
            id='eudic-token'
            type='password'
            autoComplete='off'
            placeholder={
              configured
                ? _('Token configured; enter a new token to replace it')
                : _('Paste your Eudic Open API token')
            }
            className='input eink-bordered h-11 w-full text-sm focus:outline-hidden'
            spellCheck='false'
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <p className='text-base-content/60 text-sm'>
            {_('Create or revoke tokens at my.eudic.net/OpenAPI/Authorization.')}
          </p>
        </div>
        <div className='flex justify-end gap-2'>
          {configured && (
            <button
              type='button'
              onClick={handleClear}
              className='btn btn-ghost h-10 min-h-10 px-4 text-sm'
            >
              {_('Clear token')}
            </button>
          )}
          <button
            type='button'
            onClick={handleSave}
            disabled={isChecking || !token.trim()}
            className={clsx(
              'btn btn-primary h-10 min-h-10 border-0 px-5 text-sm',
              isChecking && 'opacity-60',
            )}
          >
            {isChecking ? (
              <span className='loading loading-spinner loading-sm' />
            ) : (
              _('Save and verify')
            )}
          </button>
        </div>
        {configured && (
          <div className='space-y-2 border-t border-base-300 pt-4'>
            <label className='flex cursor-pointer items-center justify-between gap-3'>
              <span className='text-sm'>{_('Automatically add selected words to Eudic')}</span>
              <input
                type='checkbox'
                className='toggle toggle-primary'
                checked={autoAdd}
                onChange={(event) => {
                  setAutoAdd(event.target.checked);
                  setStoredEudicAutoAdd(event.target.checked);
                }}
              />
            </label>
            <p className='text-base-content/60 text-sm'>
              {_('Only single words and short phrases are added automatically.')}
            </p>
            <SectionTitle as='label' htmlFor='eudic-wordbook' className='block'>
              {_('Default Eudic wordbook')}
            </SectionTitle>
            <select
              id='eudic-wordbook'
              className='select select-bordered h-11 w-full text-sm'
              value={categoryId}
              disabled={isLoadingCategories || categories.length === 0}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setStoredEudicCategoryId(event.target.value);
              }}
            >
              {categories.length === 0 ? (
                <option value='0'>
                  {isLoadingCategories ? _('Loading wordbooks...') : _('My wordbook')}
                </option>
              ) : (
                categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              )}
            </select>
            <div className='flex gap-2'>
              <input
                type='text'
                className='input eink-bordered h-10 min-w-0 flex-1 text-sm'
                placeholder={_('New wordbook name')}
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreateCategory();
                }}
              />
              <button
                type='button'
                onClick={() => void handleCreateCategory()}
                disabled={!newCategoryName.trim()}
                className='btn btn-outline h-10 min-h-10 px-4 text-sm'
              >
                {_('Add wordbook')}
              </button>
            </div>
            <p className='text-base-content/60 text-sm'>
              {_('Selected words and dictionary favorites use this wordbook.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EudicForm;
