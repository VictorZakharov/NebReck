import type { ResourceType } from '../entities/PickupSystem';

export type HoldingIcon = ResourceType | 'nano' | 'missile';

/**
 * Small, original line icons shared by every material/consumable holding.
 * They inherit `currentColor`, so the same geometry works in the HUD,
 * engineering hold, merchant inventory, and recipe cost chips.
 */
export function holdingIconSvg(
  kind: HoldingIcon,
  extraClass = '',
): string {
  const paths = ICON_PATHS[kind];
  const classes = ['holding-icon', `holding-${kind}`, extraClass]
    .filter(Boolean)
    .join(' ');
  return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

const ICON_PATHS: Record<HoldingIcon, string> = {
  scrap: `
    <path class="icon-fill icon-faint" d="M3.2 17.8 7.8 5.4l4.7 12.4Z"/>
    <path class="icon-fill" d="m10.1 18.8 4.1-12.2 6.6 12.2Z"/>
    <path d="m5.7 14.2 5.6-2.1m1.4 2.6 5-2.2M8 7.4l6.3 3.1" />
    <circle class="icon-fill" cx="15.3" cy="10.4" r="1"/>
  `,
  crystal: `
    <path class="icon-fill icon-faint" d="m12 2.6 7 6.5-7 12.3L5 9.1Z"/>
    <path d="m12 2.6 2.7 6.8L12 21.4 9.3 9.4Zm-7 6.5 4.3.3L12 2.6m7 6.5-4.3.3L12 2.6M5 9.1l7 4.1 7-4.1"/>
  `,
  flux: `
    <circle class="icon-fill" cx="12" cy="12" r="2.7"/>
    <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)"/>
    <ellipse class="icon-faint" cx="12" cy="12" rx="8.2" ry="3.2" transform="rotate(62 12 12)"/>
    <circle class="icon-fill" cx="4.6" cy="8.1" r="1.15"/>
    <circle class="icon-fill" cx="18.8" cy="16.7" r="1"/>
  `,
  nano: `
    <path class="icon-fill icon-faint" d="m12 2.8 7.8 4.5v9L12 20.8l-7.8-4.5v-9Z"/>
    <path d="m12 2.8 7.8 4.5-7.8 4.5-7.8-4.5m7.8 4.5v9"/>
    <path class="icon-solid" d="M10.4 6.2h3.2v2.2h2.2v3.2h-2.2v2.2h-3.2v-2.2H8.2V8.4h2.2Z"/>
  `,
  missile: `
    <path class="icon-fill icon-faint" d="M13.1 3.1c3.8 1.5 5.8 5.3 5.8 9.4l-4.6 4.6-7.4-7.4Z"/>
    <path d="M13.1 3.1 6.9 9.7l7.4 7.4 4.6-4.6c0-4.1-2-7.9-5.8-9.4Z"/>
    <path d="m8.2 11-3.7.7-1.4 3.2 5.3.1m4.6 4.6.1-5.3m-2.4 3.5-2.8 2.8m-2.4-1.2 2.3-2.3"/>
    <circle class="icon-fill" cx="14.5" cy="8.2" r="1.25"/>
  `,
};
