import { useRouter } from 'expo-router';

/**
 * back() that can't strand the user. After a deep link or a web refresh the
 * navigation stack may have no history, in which case GO_BACK is a no-op —
 * fall back to replacing with the home tab instead.
 */
export function useSafeBack() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
}
