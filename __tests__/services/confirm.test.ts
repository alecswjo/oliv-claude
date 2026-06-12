import { Alert, Platform } from 'react-native';
import { confirmAction } from '@/services/confirm';

/**
 * RN Web's Alert.alert is a silent no-op — the original "Delete meal does
 * nothing in the browser" bug. confirmAction must branch to window.confirm
 * there.
 */

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

describe('confirmAction', () => {
  afterEach(() => {
    setPlatform('ios');
    delete (globalThis as { confirm?: unknown }).confirm;
  });

  it('uses window.confirm on web and resolves with the user choice', async () => {
    setPlatform('web');
    const confirmMock = jest.fn(() => true);
    (globalThis as { confirm?: unknown }).confirm = confirmMock;

    await expect(
      confirmAction({ title: 'Delete this meal?', message: 'Sure?', confirmLabel: 'Delete', destructive: true }),
    ).resolves.toBe(true);
    expect(confirmMock).toHaveBeenCalledWith('Delete this meal?\n\nSure?');

    confirmMock.mockReturnValue(false);
    await expect(
      confirmAction({ title: 'Delete this meal?', confirmLabel: 'Delete' }),
    ).resolves.toBe(false);
  });

  it('shows a cancelable destructive Alert on native', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      expect(buttons?.some((button) => button.style === 'cancel')).toBe(true);
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

    await expect(
      confirmAction({ title: 'Delete this meal?', message: 'Sure?', confirmLabel: 'Delete', destructive: true }),
    ).resolves.toBe(true);
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
