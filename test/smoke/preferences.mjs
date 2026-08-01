import { capturePageErrors, settleBrowserFrames } from './helpers.mjs';

const SHIP_COOKIE = 'nebreck_hangar_ship';
const DIFFICULTY_COOKIE = 'nebreck_hangar_difficulty';

async function openHangarLikeAPlayer(page) {
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.getByRole('button', { name: 'Hangar', exact: true }).click();
  await page.waitForFunction(() => window.game.state === 'hangar');
  await settleBrowserFrames(page, 4);
}

async function preferenceState(page) {
  return page.evaluate(({ shipCookie, difficultyCookie }) => {
    const cookies = Object.fromEntries(
      document.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return [decodeURIComponent(name), decodeURIComponent(value.join('='))];
      }),
    );
    const shipWriteValues = window.__HANGAR_COOKIE_WRITES__.filter(
      (value) => value.startsWith(`${shipCookie}=`),
    );
    return {
      ship: window.game.selectedShipId,
      difficulty: window.game.selectedDifficultyId,
      playerShip: window.game.player.def.id,
      selectedCard:
        document.querySelector('.ship-card.selected .ship-card-name')?.textContent ?? '',
      shipCookie: cookies[shipCookie] ?? null,
      difficultyCookie: cookies[difficultyCookie] ?? null,
      cookieWrites: window.__HANGAR_COOKIE_WRITES__.length,
      writeValues: [...window.__HANGAR_COOKIE_WRITES__],
      shipWrites: shipWriteValues.length,
      shipWriteValues,
    };
  }, { shipCookie: SHIP_COOKIE, difficultyCookie: DIFFICULTY_COOKIE });
}

export async function runPreferenceSmoke(browser, baseUrl, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  capturePageErrors(page, errors, 'hangar preference page');
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const writes = [];
    Object.defineProperty(window, '__HANGAR_COOKIE_WRITES__', { value: writes });
    if (!descriptor?.get || !descriptor.set) return;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => descriptor.get.call(document),
      set: (value) => {
        writes.push(String(value));
        descriptor.set.call(document, value);
      },
    });
  });
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/?seed=7`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.game));
  await openHangarLikeAPlayer(page);
  const defaults = await preferenceState(page);

  await page.context().addCookies([
    { name: SHIP_COOKIE, value: 'vanta', url: `${baseUrl}/` },
    { name: DIFFICULTY_COOKIE, value: 'rookie', url: `${baseUrl}/` },
  ]);

  await page.goto(`${baseUrl}/?seed=7`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.game));
  await openHangarLikeAPlayer(page);
  const settled = await preferenceState(page);

  const kestrel = page.locator('.ship-card').filter({ hasText: 'KV-7 Kestrel' });
  const box = await kestrel.boundingBox();
  if (!box) throw new Error('Kestrel card has no interactive layout box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.game.selectedShipId === 'kestrel');
  await settleBrowserFrames(page, 4);
  const clicked = await preferenceState(page);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.game));
  await openHangarLikeAPlayer(page);
  const reloaded = await preferenceState(page);
  await page.close();

  console.log(
    'hangar preference lifecycle:',
    JSON.stringify({ defaults, settled, clicked, reloaded }),
  );
  return { defaults, settled, clicked, reloaded };
}
