import clsx from 'clsx';
import React, { useState } from 'react';
import { EudicApiClient } from '../../../../../../enhanced/features/eudic/eudic-api-client';
import {
  clearStoredEudicToken,
  getStoredEudicToken,
  setStoredEudicToken,
} from '../../../../../../enhanced/features/eudic/token-storage';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import SubPageHeader from '../SubPageHeader';
import { SectionTitle } from '../primitives';

interface EudicFormProps {
  onBack: () => void;
}

const EudicForm: React.FC<EudicFormProps> = ({ onBack }) => {
  const _ = useTranslation();
  const configured = !!getStoredEudicToken();
  const [token, setToken] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleSave = async () => {
    const normalized = token.trim();
    if (!normalized) return;
    setStoredEudicToken(normalized);
    const client = new EudicApiClient(normalized);
    setIsChecking(true);
    try {
      await client.checkConnection();
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
    eventDispatcher.dispatch('toast', { message: _('Eudic token cleared'), type: 'info' });
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
      </div>
    </div>
  );
};

export default EudicForm;
