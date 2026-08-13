import { describe, it, expect } from 'vitest';
import { toReadableErrorMessage } from '../src/main/ipc';

describe('toReadableErrorMessage', () => {
  it('passes through a plain Error message unchanged', () => {
    expect(toReadableErrorMessage(new Error('some message'))).toBe('some message');
  });

  it('passes through an unrelated RangeError message unchanged', () => {
    expect(toReadableErrorMessage(new RangeError('Invalid array length'))).toBe(
      'Invalid array length',
    );
  });

  it('replaces a call-stack-overflow RangeError with a readable fallback message', () => {
    const message = toReadableErrorMessage(new RangeError('Maximum call stack size exceeded'));
    expect(message).not.toContain('call stack');
    expect(message).toBe('파일에 쓸 수 없습니다 (권한을 확인해주세요)');
  });

  it('stringifies a non-Error thrown value', () => {
    expect(toReadableErrorMessage('plain string throw')).toBe('plain string throw');
    expect(toReadableErrorMessage({ code: 'EPERM' })).toBe(String({ code: 'EPERM' }));
  });
});
