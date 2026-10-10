/* Shared toast: upper glass notification, lifetime, motion and native top layer.
 * node registry/test-toast.cjs [registry/index.html | standalone.html]
 * An isolated offline browser profile never touches the user's local storage. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {PNG} = require(process.env.BPM_PNGJS || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-toast-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'isolated-prototype.html');
  fs.copyFileSync(source, isolated);
  source = isolated;
}

const notify = (page, message, success = false) => page.evaluate(({message, success}) => window.BpmToast.show(message, {success}), {message, success});
const state = page => page.locator('#toast').evaluate(element => {
  const css = getComputedStyle(element), glass = getComputedStyle(element, '::before'), rect = element.getBoundingClientRect();
  return {
    hidden:element.hidden, open:element.matches(':popover-open'), popover:element.getAttribute('popover'),
    text:element.textContent, images:element.querySelectorAll('img').length,
    role:element.getAttribute('role'), position:css.position, background:css.backgroundColor,
    backdrop:css.backdropFilter || css.webkitBackdropFilter, glassBackground:glass.backgroundColor,
    glassBackdrop:glass.backdropFilter || glass.webkitBackdropFilter, radius:css.borderRadius,
    shape:glass.clipPath, offsetWidth:element.offsetWidth, minHeight:css.minHeight,
    color:css.color, fontSize:css.fontSize, lineHeight:css.lineHeight, fontWeight:css.fontWeight,
    animations:css.animationName, pointerEvents:css.pointerEvents,
    rect:{left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, width:rect.width, height:rect.height},
    viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth,
    focus:document.activeElement?.id || document.activeElement?.getAttribute('name') || document.activeElement?.tagName
  };
});

async function settleEntrance(page) {
  await page.locator('#toast').evaluate(element => {
    for (const animation of element.getAnimations()) if (animation.animationName === 'toast-enter') animation.finish();
  });
}

async function accessibleStatuses(page, message) {
  const session = await page.context().newCDPSession(page);
  try {
    const {nodes} = await session.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map(node => [node.nodeId, node]));
    const content = id => {
      const node = byId.get(id);
      return node ? [node.name?.value || '', ...(node.childIds || []).map(content)].join(' ') : '';
    };
    const statuses = nodes.filter(node => !node.ignored && node.role?.value === 'status' && content(node.nodeId).includes(message));
    return await Promise.all(statuses.map(async node => {
      const {node:dom} = await session.send('DOM.describeNode', {backendNodeId:node.backendDOMNodeId});
      const attributes = Object.fromEntries(Array.from({length:(dom.attributes?.length || 0) / 2}, (_,index) => dom.attributes.slice(index * 2, index * 2 + 2)));
      return {id:attributes.id || '', className:attributes.class || '', text:content(node.nodeId)};
    }));
  } finally {await session.detach();}
}

async function motionSamples(page, name) {
  return page.locator('#toast').evaluate((element, name) => {
    const animation = element.getAnimations().find(candidate => candidate.animationName === name);
    if (!animation) return null;
    const duration = Number(animation.effect.getTiming().duration);
    animation.pause();
    const frames = [];
    for (let index = 0; index <= 20; index++) {
      animation.currentTime = duration * index / 20;
      const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
      frames.push({offset:index / 20, top:rect.top, bottom:rect.bottom, opacity:Number(css.opacity)});
    }
    animation.finish();
    return {duration, frames};
  }, name);
}

function assertPosition(value, label) {
  const {rect, viewport} = value;
  assert.ok(Math.abs(rect.left + rect.width / 2 - viewport / 2) <= 1, `${label}: horizontally centered`);
  assert.ok(rect.top >= 0 && rect.top <= 40, `${label}: placed near the top of the viewport`);
  assert.ok(rect.left >= 0 && rect.right <= viewport + 1, `${label}: fits the viewport horizontally`);
  assert.ok(value.scrollWidth <= viewport + 1, `${label}: no page horizontal overflow`);
}

function assertGlass(value, label) {
  assert.equal(value.position, 'fixed', `${label}: notification is fixed to the viewport`);
  assert.equal(value.radius, '16px', `${label}: radius is 16px`);
  assert.ok(parseFloat(value.minHeight) >= 51.2 && value.rect.height >= 51.2, `${label}: geometry has room for 60% smoothing with a 16px radius`);
  const start = value.shape.match(/^path\(["']?M\s+([\d.-]+)\s+([\d.-]+)/);
  assert.ok(start, `${label}: the rendered glass uses the smooth corner path`);
  assert.ok(Math.abs(Number(start[1]) - (value.offsetWidth - 25.6)) <= .002 && Math.abs(Number(start[2])) <= .002, `${label}: the path includes the complete 25.6px corner budget for 60% smoothing`);
  const backgrounds = [value.background, value.glassBackground].map(color => color.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/));
  const rgba = backgrounds.find(match => match && Number(match[4] ?? 1) > 0);
  assert.ok(rgba, `${label}: a computed RGB glass background is present`);
  assert.ok(rgba.slice(1, 4).every(channel => Number(channel) <= 40), `${label}: glass background is black`);
  assert.ok(Number(rgba[4] ?? 1) > 0 && Number(rgba[4] ?? 1) < 1, `${label}: black background is translucent`);
  assert.match([value.backdrop, value.glassBackdrop].join(' '), /blur\([\d.]+px\)/, `${label}: glass blurs the content behind it`);
  assert.equal(value.color, 'rgb(255, 255, 255)', `${label}: text remains white`);
  assert.equal(value.fontSize, '17px', `${label}: Simple Text is 17px`);
  assert.equal(value.lineHeight, '24px', `${label}: Simple Text line-height is 24px`);
  assert.equal(value.fontWeight, '400', `${label}: Simple Text uses regular weight`);
  assert.equal(value.role, 'status', `${label}: notification retains its accessible status role`);
  assert.equal(value.popover, 'manual', `${label}: uses a manual popover in the native top layer`);
  assert.ok(!value.hidden && value.open, `${label}: the shared toast is open`);
}

async function assertLifetime(page) {
  await page.clock.runFor(3999);
  let value = await state(page);
  assert.ok(!value.hidden && value.open, 'Toast remains visible immediately before four seconds');
  assert.doesNotMatch(value.animations, /toast-exit/, 'Departure does not begin before four seconds');
  await page.clock.runFor(1);
  value = await state(page);
  assert.match(value.animations, /toast-exit/, 'Departure starts four seconds after invocation');
  const exit = await motionSamples(page, 'toast-exit');
  assert.ok(exit, 'Departure has an actual CSS animation');
  assert.equal(exit.duration, 280, 'Departure lasts 280ms');
  assert.ok(exit.frames[0].top >= 0, 'Departure begins at the resting position');
  assert.ok(exit.frames.at(-1).bottom < 0, 'Departure flies completely above the viewport');
  await page.clock.runFor(300);
  await page.waitForFunction(() => document.querySelector('#toast').hidden && !document.querySelector('#toast').matches(':popover-open'));
}

async function assertSuccess(page) {
  await notify(page, 'Успешное действие', true);
  await settleEntrance(page);
  const icon = await page.locator('#toast').evaluate(async element => {
    const image = element.querySelector('img');
    if (!image) return null;
    await image.decode();
    return {width:image.width, height:image.height, loaded:image.naturalWidth > 0, src:image.src};
  });
  assert.ok(icon?.loaded, 'Successful notifications retain the loaded check icon');
  assert.equal(icon.width, 24, 'Success check is 24px wide');
  assert.equal(icon.height, 24, 'Success check is 24px tall');
  const comma = icon.src.indexOf(',');
  const svg = icon.src.startsWith('data:')
    ? /;base64,/i.test(icon.src) ? Buffer.from(icon.src.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(icon.src.slice(comma + 1))
    : fs.readFileSync(fileURLToPath(icon.src), 'utf8');
  assert.match(svg, /#34c759/i, 'Success check retains its green color');
  assert.equal((await state(page)).text, 'Успешное действие', 'Successful notification retains the message');
  await notify(page, 'Обычное действие');
  await settleEntrance(page);
  assert.equal((await state(page)).images, 0, 'A following ordinary message does not retain the prior check');
}

async function assertRestart(page) {
  await notify(page, 'Предыдущее сообщение');
  await settleEntrance(page);
  await page.clock.runFor(2500);
  await page.evaluate(() => {
    for (let index = 1; index <= 20; index++) window.BpmToast.show(`Последнее сообщение ${index}`, {success:index % 2 === 0});
  });
  await settleEntrance(page);
  assert.equal(await page.locator('#toast').count(), 1, 'Rapid notifications keep one shared toast');
  const latest = await state(page);
  assert.equal(latest.text, 'Последнее сообщение 20', 'Rapid calls display only the latest message');
  assert.equal(latest.images, 1, 'Rapid successful calls do not accumulate check icons');
  await page.clock.runFor(1500);
  assert.ok((await state(page)).open, 'The previous timer cannot hide the latest message');
  await page.clock.runFor(2499);
  assert.doesNotMatch((await state(page)).animations, /toast-exit/, 'The latest message gets its own complete four seconds');
  await page.clock.runFor(1);
  assert.match((await state(page)).animations, /toast-exit/, 'The restarted timer begins departure at the new deadline');

  // Replacing a message during departure must cancel the pending hide as well.
  await notify(page, 'Сообщение во время закрытия');
  await settleEntrance(page);
  await page.clock.runFor(300);
  assert.ok((await state(page)).open, 'An obsolete departure cannot hide a replacement message');
  assert.equal((await state(page)).text, 'Сообщение во время закрытия');
}

async function assertModal(page) {
  await page.evaluate(() => document.querySelector('#insights-create').click());
  await page.locator('#insight-create-drawer').waitFor({state:'visible'});
  const focus = await page.evaluate(() => {
    const input = document.querySelector('#insight-create-drawer [name=title]');
    input.focus();
    return document.activeElement === input;
  });
  assert.ok(focus, 'An actual native modal drawer has keyboard focus');
  await notify(page, 'Уведомление поверх дровера');
  await settleEntrance(page);
  await page.clock.runFor(20);
  const announcement = page.locator('#insight-create-drawer .toast-announcement');
  assert.equal(await announcement.count(), 1, 'The active modal has one live announcement counterpart');
  assert.equal(await announcement.getAttribute('aria-live'), 'polite', 'Modal counterpart announces politely');
  assert.equal(await announcement.getAttribute('aria-atomic'), 'true', 'Modal counterpart announces the complete message');
  assert.equal(await page.locator('#toast').getAttribute('aria-hidden'), 'true', 'The visual toast explicitly avoids a duplicate modal announcement');
  const exposed = await accessibleStatuses(page, 'Уведомление поверх дровера');
  assert.equal(exposed.length, 1, `One status with the notification is exposed in the actual Chrome accessibility tree: ${JSON.stringify(exposed)}`);
  const modal = await page.locator('#toast').evaluate(element => {
    const focused = document.querySelector('#insight-create-drawer [name=title]');
    const rect = element.getBoundingClientRect(), drawer = document.querySelector('#insight-create-drawer').getBoundingClientRect();
    return {
      modal:document.querySelector('#insight-create-drawer').matches(':modal'),
      sameFocus:document.activeElement === focused, open:element.matches(':popover-open'),
      sample:{x:Math.floor(rect.right - 10), y:Math.floor(rect.top + rect.height / 2)},
      drawer:{left:drawer.left, right:drawer.right, top:drawer.top, bottom:drawer.bottom}
    };
  });
  assert.ok(modal.modal, 'The creation drawer is a native modal, not a simulated overlay');
  assert.ok(modal.open, 'Manual popover remains in the native top layer while the modal is open');
  assert.ok(modal.sameFocus, 'Showing a toast does not steal focus from the modal input');
  assert.ok(modal.sample.x > modal.drawer.left && modal.sample.x < modal.drawer.right && modal.sample.y > modal.drawer.top && modal.sample.y < modal.drawer.bottom, 'The sample point overlaps the actual native modal');
  const visible = PNG.sync.read(await page.screenshot({path:path.join(output, 'toast-native-modal.png')}));
  await page.locator('#toast').evaluate(element => element.style.visibility = 'hidden');
  const baseline = PNG.sync.read(await page.screenshot());
  await page.locator('#toast').evaluate(element => element.style.removeProperty('visibility'));
  const offset = (modal.sample.y * visible.width + modal.sample.x) * 4;
  const brightness = image => image.data[offset] + image.data[offset + 1] + image.data[offset + 2];
  // An inert toast is intentionally absent from hit testing during a modal.
  // Pixels, rather than pointer targeting, prove it paints above that modal.
  assert.ok(brightness(visible) < brightness(baseline) - 120, 'Black glass is visibly painted above the native modal drawer');
  await notify(page, 'Новое сообщение в дровере');
  await settleEntrance(page);
  await page.clock.runFor(20);
  assert.equal(await announcement.count(), 1, 'Repeating a toast replaces the modal counterpart');
  assert.equal(await announcement.textContent(), 'Новое сообщение в дровере', 'Modal live region keeps only the current notification');
  assert.equal((await accessibleStatuses(page, 'Уведомление поверх дровера')).length, 0, 'The previous notification is removed from the actual accessibility tree');
  await page.clock.runFor(3979);
  assert.equal(await announcement.count(), 1, 'The modal counterpart remains during the visible lifetime');
  await page.clock.runFor(301);
  assert.equal(await announcement.count(), 0, 'The modal counterpart is removed after departure');
  assert.equal((await accessibleStatuses(page, 'Новое сообщение в дровере')).length, 0, 'Dismissal removes the notification from accessibility');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#insight-create-drawer [name=title]')), true, 'Announcement replacement and dismissal preserve input focus');
  await page.evaluate(() => document.querySelector('#insight-create-drawer [data-close]').click());
  await page.clock.runFor(500);
  await page.locator('#insight-create-drawer').waitFor({state:'hidden'});
}

async function assertProcessRoute(page) {
  await page.evaluate(() => {
    const row = window.BPM_DATA.find(record => record.entity === 'processes');
    window.BpmProcessDrawer.open(row, {skipLoading:true});
    const action = document.querySelector('#process-drawer [data-pd-action=period-next]');
    action.focus();
    action.click();
  });
  await settleEntrance(page);
  await page.clock.runFor(20);
  const value = await state(page);
  assert.ok(value.open && !value.hidden, 'Process drawer actions use the same global toast');
  assert.match(value.text, /В демонстрации показан период/, 'Process drawer forwards its actual notification message');
  assert.equal(await page.locator('#process-drawer .pd-notice:not([hidden])').count(), 0, 'Process drawer does not show a second local notification');
  assert.equal(await page.locator('#process-drawer').getByRole('status').filter({hasText:value.text}).count(), 1, 'The forwarded process notification is accessible inside its native modal');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.pdAction), 'period-next', 'Process notification preserves the originating control focus');
  await page.evaluate(() => window.BpmProcessDrawer.close());
  await page.clock.runFor(500);
  await page.locator('#process-drawer').waitFor({state:'hidden'});
}

async function prepare(browser, width, motion) {
  const context = await browser.newContext({viewport:{width, height:width === 390 ? 844 : 900}, reducedMotion:motion, offline:true});
  const page = await context.newPage(), errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (/^https?:/u.test(request.url())) remote.push(request.url());});
  page.setDefaultTimeout(15000);
  await page.goto(pathToFileURL(source).href + '#insights');
  await page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => typeof window.BpmToast?.show), 'function', 'Shared toast API is available');
  await page.clock.install({time:new Date('2026-10-10T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-10T12:00:01Z'));
  return {context, page, errors, remote};
}

async function runAnimated(browser) {
  const {context, page, errors, remote} = await prepare(browser, 1440, 'no-preference');
  try {
    await page.locator('#insights-create').focus();
    const focused = await page.evaluate(() => document.activeElement.id);
    await notify(page, 'Сообщение в верхней части экрана');
    const entrance = await motionSamples(page, 'toast-enter');
    assert.ok(entrance, 'Toast has an actual entrance animation');
    assert.equal(entrance.duration, 600, 'Bouncing entrance lasts 600ms');
    assert.ok(entrance.frames[0].bottom < 0, 'Entrance starts completely above the viewport');
    const finalTop = entrance.frames.at(-1).top;
    assert.ok(entrance.frames.some(frame => frame.top > finalTop + 2), 'Entrance overshoots the resting position for a visible bounce');
    assert.ok(entrance.frames.slice(1).some((frame, index) => frame.top < entrance.frames[index].top - 1), 'Entrance returns upward after the bounce');
    const value = await state(page);
    assertPosition(value, '1440px');
    assertGlass(value, '1440px');
    assert.equal(value.focus, focused, 'Showing a toast does not steal normal page focus');
    await page.screenshot({path:path.join(output, 'toast-desktop.png')});
    await assertLifetime(page);
    await assertSuccess(page);
    await assertRestart(page);
    await assertProcessRoute(page);
    await assertModal(page);
    assert.deepEqual(errors, [], 'Desktop: no runtime errors');
    assert.deepEqual(remote, [], 'Desktop: all notifications are offline');
    console.log('PASS — Desktop glass styling, bouncing entrance, four-second lifetime, upward departure, success icon, timer restart, process route, modal top layer, accessibility and focus.');
  } catch (error) {
    await page.screenshot({path:path.join(output, 'failure-desktop.png')}).catch(() => {});
    throw error;
  } finally {await context.close();}
}

async function runReducedMobile(browser) {
  const {context, page, errors, remote} = await prepare(browser, 390, 'reduce');
  try {
    const message = 'Изменения сохранены. Дополнительная информация по выбранному процессу доступна в соответствующем разделе кабинета.';
    await notify(page, message, true);
    const initial = await state(page);
    assertGlass(initial, '390px reduced motion');
    assertPosition(initial, '390px reduced motion');
    assert.equal(initial.text, message, 'Mobile wraps the complete message without truncation');
    assert.equal((await accessibleStatuses(page, message)).length, 1, 'Normal page notifications expose one global accessible status');
    const translated = await page.locator('#toast').evaluate(element => element.getAnimations().some(animation => animation.effect.getKeyframes().some(frame => /translate/i.test(String(frame.transform)))));
    assert.equal(translated, false, 'Reduced motion has no translation animation');
    await page.clock.runFor(3999);
    const resting = await state(page);
    assert.ok(resting.open && !resting.hidden, 'Reduced motion preserves the four-second lifetime');
    assert.ok(Math.abs(initial.rect.top - resting.rect.top) <= 1, 'Reduced motion keeps the toast at its resting position');
    await page.screenshot({path:path.join(output, 'toast-mobile-reduced-motion.png')});
    await page.clock.runFor(400);
    assert.equal((await state(page)).hidden, true, 'Reduced motion still dismisses the notification');
    assert.equal((await state(page)).open, false, 'Reduced motion removes the native top-layer popover');
    assert.deepEqual(errors, [], 'Mobile: no runtime errors');
    assert.deepEqual(remote, [], 'Mobile: all notifications are offline');
    console.log('PASS — 390px glass typography, complete wrapped message, no horizontal overflow and reduced motion without translation.');
  } catch (error) {
    await page.screenshot({path:path.join(output, 'failure-mobile.png')}).catch(() => {});
    throw error;
  } finally {await context.close();}
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    await runAnimated(browser);
    await runReducedMobile(browser);
    console.log(`Screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(`Screenshots: ${output}`); console.error(error); process.exitCode = 1;});
