import { useEffect } from 'react';
import { scrollIntoViewByDataAttribute } from '../mail/keyboard';

type UseScrollToDataAttributeOptions = {
  enabled: boolean;
  attribute: string;
  value: string | null | undefined;
};

export function useScrollToDataAttribute({
  enabled,
  attribute,
  value,
}: UseScrollToDataAttributeOptions): void {
  useEffect(() => {
    if (!enabled || !value) return;
    scrollIntoViewByDataAttribute(attribute, value);
  }, [enabled, attribute, value]);
}
