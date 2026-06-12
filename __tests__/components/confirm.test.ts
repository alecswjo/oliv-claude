import { Alert, Platform } from 'react-native';
import { confirmDestructive } from '@/components/confirm';

/**
 * RN Web's Alert.alert is a silent no-op — the original "Delete meal does
 * nothing in the browser" bug. confirmDestructive must branch to
 * window.confirm there.
 */

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

describe('confirmDestructive', () => {
  afterEach(() => {
    setPlatform('ios');
    delete (globalThis as { confirm?: unknown }).confirm;
  });

  it('uses window.confirm on web and only confirms when accepted', () => {
    setPlatform('web');
    const confirmMock = jest.fn(() => true);
    (globalThis as { confirm?: unknown }).confirm = confirmMock;
    const onConfirm = jest.fn();

    confirmDestructive({ title: 'Delete this meal?', message: 'Sure?', confirmLabel: 'Delete', onConfirm });
    expect(confirmMock).toHaveBeenCalledWith('Delete this meal?\n\nSure?');
    expect(onConfirm).toHaveBeenCalledTimes(1);

    confirmMock.mockReturnValue(false);
    confirmDestructive({ title: 'Delete this meal?', message: 'Sure?', confirmLabel: 'Delete', onConfirm });
    expect(onConfirm).toHaveBeenCalledTimes(1); // declined → unchanged
  });

  it('shows a cancelable destructive Alert on native', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      expect(buttons?.some((button) => button.style === 'cancel')).toBe(true);
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const onConfirm = jest.fn();

    confirmDestructive({ title: 'Delete this meal?', message: 'Sure?', confirmLabel: 'Delete', onConfirm });
    expect(alertSpy).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});
