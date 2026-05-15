import { useEvent } from 'react-use';
import {
  isVerticalNavigationKey,
  navigationDirectionFromKey,
  shouldIgnoreColumnShortcut,
  type NavigationDirection,
} from '../mail/keyboard';

type UseColumnArrowNavigationOptions<T> = {
  enabled: boolean;
  resolveNeighbor: (direction: NavigationDirection) => T | null;
  onNavigate: (item: T) => void;
};

export function useColumnArrowNavigation<T>({
  enabled,
  resolveNeighbor,
  onNavigate,
}: UseColumnArrowNavigationOptions<T>): void {
  useEvent('keydown', (event) => {
    if (!enabled || !isVerticalNavigationKey(event.key)) return;
    if (shouldIgnoreColumnShortcut(event)) return;

    const direction = navigationDirectionFromKey(event.key);
    if (!direction) return;

    const neighbor = resolveNeighbor(direction);
    if (!neighbor) return;

    event.preventDefault();
    onNavigate(neighbor);
  });
}
