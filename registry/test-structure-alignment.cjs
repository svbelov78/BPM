/* Responsive regression checks for the structure registry's shared columns. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const widths = [1920, 1440, 1024, 390, 320];
const failures = [];
const results = [];
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);
function check(width, label, callback) {
  try { callback(); }
  catch (error) { failures.push(`${width}px — ${label}: ${error.message}`); }
}

async function noPageOverflow(page, width, state) {
  const dimensions = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
  check(width, `${state} page overflow`, () => {
    assert.ok(dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.body <= dimensions.viewport + 1, JSON.stringify(dimensions));
  });
}

async function alignedToolbar(page, width, state, searchId) {
  const positions = await page.evaluate(id => {
    const button = document.querySelector('#structure-toggle').getBoundingClientRect();
    const field = document.getElementById(id).closest('.search-field').getBoundingClientRect();
    return {buttonY: button.y, fieldY: field.y, buttonHeight: button.height, fieldHeight: field.height};
  }, searchId);
  check(width, `${state} toolbar alignment`, () => {
    assert.ok(positions.fieldHeight > 0, 'Active search field is visible');
    close(positions.buttonY, positions.fieldY, 'Structure button and search field share their top edge');
  });
  await noPageOverflow(page, width, state);
}

async function mobileFilterState(page, width, open) {
  const toggle = page.locator('#mobile-filters-toggle');
  if (await toggle.getAttribute('aria-expanded') !== String(open)) await toggle.click();
  const state = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector), rect = element.getBoundingClientRect();
      return {top: rect.top, bottom: rect.bottom, height: rect.height, visible: Boolean(element.getClientRects().length)};
    };
    return {
      toolbar: box('.structure-toolbar'), tabs: box('.structure-toolbar > .entity-tabs'),
      toggle: box('#mobile-filters-toggle'), status: box('#status-select'), grid: box('#filter-grid'),
      expanded: document.querySelector('#mobile-filters-toggle').getAttribute('aria-expanded')
    };
  });
  check(width, `mobile filters ${open ? 'open' : 'closed'}`, () => {
    assert.equal(state.expanded, String(open));
    assert.equal(state.status.visible, open, 'Status visibility follows the filter toggle');
    assert.equal(state.grid.visible, open, 'Filter grid visibility follows the filter toggle');
    close(state.toggle.top - state.tabs.bottom, 12, 'Filter toggle follows entity tabs with one gap');
    if (open) close(state.status.top - state.toggle.bottom, 12, 'Status follows the filter toggle with one gap');
    close(state.toolbar.bottom, (open ? state.status : state.toggle).bottom, 'Toolbar has no empty trailing grid rows');
  });
  await alignedToolbar(page, width, `mobile filters ${open ? 'open' : 'closed'}`, 'registry-search');
}

async function finalVisibleCounters(page, width, state) {
  const counters = await page.locator('.structure-chart').evaluateAll(charts => charts.filter(chart => {
    const rect = chart.getBoundingClientRect();
    return rect.height && rect.bottom > 0 && rect.top < innerHeight;
  }).flatMap(chart => [...chart.querySelectorAll('[data-structure-number]')].map(number => ({text: number.textContent, target: Number(number.dataset.structureNumber)}))));
  check(width, `${state} final counters`, () => {
    assert.ok(counters.length > 0, 'At least one chart is visible');
    counters.forEach(counter => assert.equal(Number(counter.text.replace(/\s/g, '')), counter.target, JSON.stringify(counter)));
  });
}

async function headingMetrics(heading) {
  return heading.evaluate(element => {
    const rect = selector => {
      const node = element.querySelector(selector);
      const box = node.getBoundingClientRect();
      return {x: box.x, y: box.y, width: box.width, height: box.height, centerY: box.y + box.height / 2};
    };
    const name = element.querySelector('.structure-name');
    const style = getComputedStyle(name);
    return {
      name: name.textContent,
      font: {size: style.fontSize, lineHeight: style.lineHeight, weight: style.fontWeight, tracking: style.letterSpacing},
      title: rect('.structure-title'),
      owner: rect('.structure-owner'),
      avatar: element.querySelector('.structure-owner > .avatar') ? rect('.structure-owner > .avatar') : null,
      ownerText: element.querySelector('.structure-owner').textContent.trim(),
      bars: rect('.structure-chart .structure-bars'),
      total: rect('.structure-total'),
      track: rect('.structure-track'),
      icon: rect('.structure-title > img'),
      nameFirstLineCenterY: name.getBoundingClientRect().top + parseFloat(getComputedStyle(name).lineHeight) / 2
    };
  });
}

async function incomingOwnerAppearance(table, width, direction) {
  const owners = await table.locator('.structure-incoming-owner').evaluateAll(elements => elements.map(owner => {
    const style = getComputedStyle(owner.querySelector('.structure-incoming-owner-name'));
    const avatar = owner.querySelector('.avatar'), circle = avatar.getBoundingClientRect();
    return {font: [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing], width: circle.width, height: circle.height, blank: avatar.childNodes.length === 0, hidden: avatar.getAttribute('aria-hidden')};
  }));
  check(width, `${direction} incoming owners`, () => {
    assert.ok(owners.length > 0, 'Related list has owners');
    owners.forEach(owner => {
      assert.deepEqual(owner.font, ['13px', '18px', '400', '-0.039px'], 'Incoming owner uses Additional/R');
      assert.deepEqual([owner.width, owner.height, owner.blank, owner.hidden], [32, 32, true, 'true'], 'Incoming avatar is a blank decorative 32px circle');
    });
  });
}

async function uniformHeadingTypography(page, width, state) {
  const headings = await page.locator('.structure-heading').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
    const name = element.querySelector('.structure-name'), icon = element.querySelector('.structure-title > img');
    const style = getComputedStyle(name), nameBox = name.getBoundingClientRect(), iconBox = icon.getBoundingClientRect();
    const title = element.querySelector('.structure-title').getBoundingClientRect(), heading = element.getBoundingClientRect();
    const siblings = [...element.children].filter(child => !child.matches('.structure-title')).map(child => child.getBoundingClientRect());
    return {
      name: name.textContent, kind: element.closest('.structure-node').dataset.kind,
      font: {size: style.fontSize, lineHeight: style.lineHeight, weight: style.fontWeight, tracking: style.letterSpacing},
      icon: {width: iconBox.width, height: iconBox.height, loaded: icon.complete && icon.naturalWidth > 0, centerY: iconBox.y + iconBox.height / 2},
      firstLineCenterY: nameBox.y + parseFloat(style.lineHeight) / 2,
      titleHeight: nameBox.height,
      titleContained: title.left >= heading.left && title.right <= heading.right + 1 && title.top >= heading.top && title.bottom <= heading.bottom + 1,
      overlaps: siblings.some(box => Math.min(title.right, box.right) - Math.max(title.left, box.left) > 1 && Math.min(title.bottom, box.bottom) - Math.max(title.top, box.top) > 1)
    };
  }));
  check(width, `${state} headings exist`, () => assert.ok(headings.length > 0));
  for (const heading of headings) {
    check(width, `${state} ${heading.name} Headline 2 SB`, () => {
      assert.deepEqual(heading.font, {size: '22px', lineHeight: '26px', weight: '590', tracking: '-0.066px'});
      assert.equal(heading.icon.loaded, true, 'Native hierarchy icon has loaded');
      assert.equal(heading.icon.width, 24);
      assert.equal(heading.icon.height, 24);
      close(heading.icon.centerY, heading.firstLineCenterY, 'Icon stays centered on the first title line');
      assert.equal(heading.titleContained, true, 'Wrapped title remains inside its accordion heading');
      assert.equal(heading.overlaps, false, 'Wrapped title does not overlap owner, chart or chevron');
    });
  }
  if (width <= 390) check(width, `${state} mobile long-title wrap`, () => assert.ok(headings.some(heading => heading.titleHeight > 26), 'Long titles wrap instead of shrinking the type style'));
}

async function hoverBackground(page, heading) {
  await heading.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(180);
  const before = await heading.evaluate(element => getComputedStyle(element).backgroundColor);
  await heading.hover();
  await page.waitForTimeout(180);
  const after = await heading.evaluate(element => getComputedStyle(element).backgroundColor);
  return {before, after};
}

async function tableLabelMetrics(product) {
  return product.locator('.structure-table th .structure-column-label').evaluateAll(labels => labels.map(label => {
    const style = getComputedStyle(label);
    const box = label.getBoundingClientRect();
    const cell = label.closest('th').getBoundingClientRect();
    const lines = new Map();
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      for (let i = 0; i < node.length; i++) {
        const character = node.textContent[i];
        if (!character.trim() || character === '\u00ad') continue;
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const glyph = range.getBoundingClientRect();
        if (!glyph.width || !glyph.height) continue;
        const key = Math.round(glyph.top);
        const line = lines.get(key) || {text: '', left: Infinity, right: -Infinity};
        line.text += character;
        line.left = Math.min(line.left, glyph.left);
        line.right = Math.max(line.right, glyph.right);
        lines.set(key, line);
      }
    }
    return {
      text: label.textContent,
      wordBreak: style.wordBreak,
      overflowWrap: style.overflowWrap,
      hyphens: style.hyphens,
      left: box.left, right: box.right,
      cellLeft: cell.left, cellRight: cell.right,
      lines: [...lines.values()]
    };
  }));
}

async function inspectWidth(browser, width) {
  const page = await browser.newPage({viewport: {width, height: 1100}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await page.waitForTimeout(2200);
    for (const view of ['cards', 'table']) {
      if (view === 'table') { await page.locator('#table-view').click(); await page.waitForTimeout(2200); }
      for (const entity of ['paths', 'processes']) {
        if (await page.locator(`#${entity}-tab`).getAttribute('aria-pressed') !== 'true') {
          await page.locator(`#${entity}-tab`).click();
          await page.waitForTimeout(2200);
        }
        await alignedToolbar(page, width, `${view}/${entity}`, 'registry-search');
        check(width, `${view}/${entity} loaded`, () => assert.equal(errors.length, 0, errors.join('; ')));
        const loaded = await page.locator(view === 'cards' ? '.entity-card:not(.skeleton-card)' : '.registry-table tbody tr').count();
        check(width, `${view}/${entity} results`, () => assert.ok(loaded > 0, 'Registry results are present'));
      }
    }
    if (width < 768) {
      await mobileFilterState(page, width, false);
      await mobileFilterState(page, width, true);
      await mobileFilterState(page, width, false);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({path: `/tmp/bpm-alignment-${width}-regular.png`, fullPage: false});
    await page.locator('#structure-toggle').click();
    await page.waitForTimeout(3300);
    await alignedToolbar(page, width, 'structure', 'structure-search');
    check(width, 'collapsed entry', () => assert.equal(errors.length, 0, errors.join('; ')));
    const expandedOnEntry = await page.locator('.structure-heading[aria-expanded=true]').count();
    const rootsOnEntry = await page.locator('#structure-list > .structure-node').count();
    const removed = await page.locator('#structure-legend, #structure-collapse, #structure-summary').count();
    check(width, 'collapsed entry', () => { assert.equal(expandedOnEntry, 0); assert.equal(rootsOnEntry, 9); });
    check(width, 'removed auxiliary controls', () => assert.equal(removed, 0));
    await finalVisibleCounters(page, width, 'initial structure');
    await uniformHeadingTypography(page, width, 'processes collapsed');

    const root = page.locator('#structure-list > .structure-node').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: 'Развитие клиентского опыта B2C'})});
    const rootHeading = root.locator(':scope > .structure-heading');
    await rootHeading.click();
    const division = root.locator('.structure-node[data-kind=division]').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: /^(Дивизион ")?Прайм("|)$/})});
    const divisionHeading = division.locator(':scope > .structure-heading');
    await divisionHeading.click();
    const product = division.locator('.structure-node[data-kind=product]').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: /^СберПрайм$/})});
    const productHeading = product.locator(':scope > .structure-heading');
    await productHeading.click();
    await page.waitForTimeout(1300);
    const rows = await product.locator('tbody tr').count();
    check(width, 'opened hierarchy', () => assert.ok(rows > 0, 'СберПрайм has process rows'));
    await noPageOverflow(page, width, 'expanded structure');

    const metrics = await Promise.all([rootHeading, divisionHeading, productHeading].map(headingMetrics));
    const panelWidth = await page.locator('.registry-panel').evaluate(element => element.clientWidth - parseFloat(getComputedStyle(element).paddingLeft) - parseFloat(getComputedStyle(element).paddingRight));
    metrics.forEach(row => check(width, `${row.name} Figma typography`, () => {
      assert.deepEqual(row.font, {size:'22px',lineHeight:'26px',weight:'590',tracking:'-0.066px'});
    }));
    await uniformHeadingTypography(page, width, 'processes expanded');
    for (const row of metrics) {
      check(width, `${row.name} owner`, () => {
        assert.ok(row.avatar, 'Owner avatar exists');
        assert.ok(row.ownerText && !/не указан|не назначен|нет данных|^—$|^–$/i.test(row.ownerText), `Owner is populated: ${row.ownerText}`);
        close(row.avatar.x, row.owner.x, 'Avatar starts the owner column');
      });
      check(width, `${row.name} first-line icon`, () => close(row.icon.centerY, row.nameFirstLineCenterY, 'Icon center matches first name line'));
      check(width, `${row.name} total baseline`, () => close(row.total.centerY, row.track.centerY, 'Total and track centers match'));
    }
    for (let i = 1; i < metrics.length; i++) {
      check(width, `${metrics[i].name} shared owner column`, () => close(metrics[i].owner.x, metrics[0].owner.x, 'Owner X matches root'));
      check(width, `${metrics[i].name} shared histogram column`, () => close(metrics[i].bars.x, metrics[0].bars.x, 'Bars X matches root'));
      check(width, `${metrics[i].name} title indentation`, () => assert.ok(metrics[i].title.x > metrics[i - 1].title.x + 1, JSON.stringify(metrics.map(row => ({name: row.name, titleX: row.title.x})))));
    }
    for (let i = 0; i < metrics.length; i++) {
      const background = await hoverBackground(page, [rootHeading, divisionHeading, productHeading][i]);
      check(width, `${metrics[i].name} open hover`, () => assert.equal(background.after, background.before, JSON.stringify(background)));
    }
    const closedHeading = page.locator('#structure-list > .structure-node > .structure-heading[aria-expanded=false]').first();
    const closedBackground = await hoverBackground(page, closedHeading);
    check(width, 'closed hover retained', () => assert.notEqual(closedBackground.before, closedBackground.after, JSON.stringify(closedBackground)));

    const labels = await tableLabelMetrics(product);
    const tableDesign = await product.locator('.structure-table').evaluate(table => {
      const row=table.tBodies[0].rows[0], pill=row.querySelector('.table-efficiency');
      return {
        headerHeight:table.tHead.getBoundingClientRect().height,
        columns:[...table.tHead.rows[0].cells].slice(1).map(cell=>cell.getBoundingClientRect().width),
        titleFont:getComputedStyle(row.querySelector('.structure-row-title')).fontSize,
        placeholderImages:row.querySelectorAll('.structure-owner>.avatar>img').length,
        glyphFirst:!pill||pill.querySelector('.bpm-efficiency-glyph').getBoundingClientRect().left<pill.querySelector('.efficiency-value').getBoundingClientRect().left
      };
    });
    check(width, 'updated Figma table geometry', () => {
      close(tableDesign.headerHeight,56,'Structure header height');
      assert.equal(tableDesign.columns.length,2,'Owner and efficiency are the only columns after the title');
      tableDesign.columns.forEach((value,index)=>close(value,[700,184][index],'Fixed table column width'));
      assert.equal(tableDesign.titleFont,'17px');
      assert.equal(tableDesign.placeholderImages,0,'Outer table uses the blank avatar from the source');
      assert.equal(tableDesign.glyphFirst,true,'Structure efficiency glyph precedes the percentage');
    });
    const relatedToggle = product.locator('.structure-table > tbody > tr[data-structure-record] .structure-row-count[aria-expanded]').first();
    await relatedToggle.click();
    const relatedDesign = await relatedToggle.evaluate(toggle => {
      const outerRow = toggle.closest('tr'), outerTable = outerRow.closest('table');
      const incomingTable = outerRow.nextElementSibling.querySelector('.structure-incoming-table');
      const incomingRow = incomingTable.tBodies[0].rows[0];
      const box = element => { const rect=element.getBoundingClientRect(); return {x:rect.x,width:rect.width}; };
      const owner = outerRow.querySelector('.structure-owner');
      const incomingOwner = incomingRow.querySelector('.structure-incoming-owner > .avatar');
      const title = getComputedStyle(incomingRow.querySelector('.structure-incoming-title'));
      const efficiency = incomingRow.querySelector('.structure-incoming-efficiency');
      const outerEfficiencyCell = outerRow.cells[2];
      const productHeading = outerTable.closest('.structure-node').querySelector(':scope > .structure-heading');
      return {
        owner:box(owner), incomingOwner:box(incomingOwner),
        headingOwner:box(productHeading.querySelector('.structure-owner')),
        outerTable:box(outerTable), outerViewport:box(outerTable.parentElement),
        firstCell:box(incomingRow.cells[0]), parentFirstCell:box(outerRow.cells[0]),
        incomingOwnerCell:box(incomingRow.cells[1]), incomingEfficiencyCell:box(incomingRow.cells[2]),
        incomingEfficiency:box(efficiency.firstElementChild), outerEfficiencyCell:box(outerEfficiencyCell),
        efficiencyPadding:getComputedStyle(efficiency).paddingLeft,
        title:{size:title.fontSize,lineHeight:title.lineHeight,weight:title.fontWeight,tracking:title.letterSpacing}
      };
    });
    check(width, 'parent and incoming column baselines', () => {
      close(relatedDesign.incomingOwner.x,relatedDesign.owner.x,'Parent and incoming avatars share one vertical');
      close(relatedDesign.firstCell.width,relatedDesign.parentFirstCell.width-16,'Incoming title column follows the parent minus its inset');
      close(relatedDesign.incomingOwnerCell.width,684,'Incoming owner track retains the shared avatar baseline');
      close(relatedDesign.incomingEfficiencyCell.width,184,'Incoming efficiency track');
      close(relatedDesign.incomingEfficiency.x,relatedDesign.outerEfficiencyCell.x+24,'Incoming indicator uses the source 40px inset after its 16px table gutter');
      assert.equal(relatedDesign.efficiencyPadding,'40px');
      assert.deepEqual(relatedDesign.title,{size:'17px',lineHeight:'24px',weight:'590',tracking:'-0.51px'});
      if(panelWidth>1100 && relatedDesign.outerTable.width<=relatedDesign.outerViewport.width+1) {
        close(relatedDesign.owner.x,relatedDesign.headingOwner.x,'Accordion and table avatars share one vertical');
      }
    });
    await incomingOwnerAppearance(product.locator('.structure-incoming-table'), width, 'Process → KP');
    await noPageOverflow(page, width, 'expanded reciprocal list');
    check(width, 'table label wrappers', () => assert.equal(labels.length, 3, 'Only title, owner and efficiency column labels remain'));
    for (const label of labels) {
      check(width, `${label.text} table label`, () => {
        assert.equal(label.wordBreak, 'normal');
        assert.equal(label.overflowWrap, 'normal');
        assert.equal(label.hyphens, 'manual');
        assert.ok(label.left >= label.cellLeft - 1 && label.right <= label.cellRight + 1, JSON.stringify(label));
        label.lines.forEach(line => assert.ok(line.left >= label.left - 1 && line.right <= label.right + 1, JSON.stringify(label)));
        if (label.text.replace(/\u00ad/g, '') === 'Эффективность' && label.lines.length > 1) {
          assert.ok(label.text.includes('\u00ad'), 'Efficiency wraps at a deliberate soft hyphen');
          assert.ok(label.lines.every(line => line.text.length > 1), JSON.stringify(label.lines));
        }
      });
    }
    await productHeading.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(1300);
    await finalVisibleCounters(page, width, 'expanded structure');
    await page.screenshot({path: `/tmp/bpm-alignment-${width}-structure.png`, fullPage: false});
    if (width === 1920) await product.locator('.structure-table > thead').screenshot({path: '/tmp/bpm-alignment-1920-table-header.png'});
    await page.locator('#structure-paths-tab').click();
    await page.waitForTimeout(2200);
    await uniformHeadingTypography(page, width, 'paths collapsed');
    const pathRoot = page.locator('#structure-list > .structure-node').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: 'Развитие клиентского опыта B2C'})});
    await pathRoot.locator(':scope > .structure-heading').click();
    const pathDivision = pathRoot.locator('.structure-node[data-kind=division]').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: /^(Дивизион ")?Прайм("|)$/})});
    await pathDivision.locator(':scope > .structure-heading').click();
    const pathProduct = pathDivision.locator('.structure-node[data-kind=product]').filter({has: page.locator(':scope > .structure-heading .structure-name', {hasText: /^СберПрайм$/})});
    await pathProduct.locator(':scope > .structure-heading').click();
    await uniformHeadingTypography(page, width, 'paths expanded');
    await pathProduct.locator('.structure-table > tbody > tr[data-structure-record] .structure-row-count[aria-expanded]').first().click();
    await incomingOwnerAppearance(pathProduct.locator('.structure-incoming-table'), width, 'KP → process');
    await noPageOverflow(page, width, 'expanded client-path structure');
    await pathProduct.locator(':scope > .structure-heading').scrollIntoViewIfNeeded();
    await page.screenshot({path: `/tmp/bpm-alignment-${width}-structure-paths.png`, fullPage: false});
    await page.locator('#structure-processes-tab').click();
    await page.waitForTimeout(2200);
    await page.locator('#structure-toggle').click();
    await page.waitForTimeout(2200);
    await alignedToolbar(page, width, 'return from structure', 'registry-search');
    const returnState = {
      table: await page.locator('.registry-table tbody tr').count(),
      processes: await page.locator('#processes-tab').getAttribute('aria-pressed'),
      structureSearchVisible: await page.locator('#structure-search').isVisible()
    };
    check(width, 'return restores regular registry', () => {
      assert.ok(returnState.table > 0, 'Table results return');
      assert.equal(returnState.processes, 'true', 'Entity selection is preserved');
      assert.equal(returnState.structureSearchVisible, false);
    });
    if (width < 768) {
      await mobileFilterState(page, width, true);
      await page.locator('#structure-toggle').click();
      await page.waitForTimeout(2200);
      await alignedToolbar(page, width, 'structure with expanded regular filters', 'structure-search');
      const inStructure = {
        toggleVisible: await page.locator('#mobile-filters-toggle').isVisible(),
        statusVisible: await page.locator('#status-select').isVisible(),
        expanded: await page.locator('.structure-heading[aria-expanded=true]').count()
      };
      check(width, 'structure re-entry with expanded regular filters', () => {
        assert.equal(inStructure.toggleVisible, false);
        assert.equal(inStructure.statusVisible, false);
        assert.equal(inStructure.expanded, 0, 'All roots collapse on re-entry');
      });
      await page.locator('#structure-toggle').click();
      await page.waitForTimeout(2200);
      await mobileFilterState(page, width, true);
      await mobileFilterState(page, width, false);
    }
    check(width, 'browser errors', () => assert.deepEqual(errors, []));
    results.push({width, rows, columns: metrics.map(row => ({name: row.name, ownerX: row.owner.x, barsX: row.bars.x, titleX: row.title.x})), labelLines: labels.map(label => ({label: label.text, lines: label.lines.map(line => line.text)}))});
  } catch (error) {
    failures.push(`${width}px — browser flow: ${error.stack || error.message}`);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // Independent pages keep every responsive case isolated while checking the same source.
    await Promise.all(widths.map(width => inspectWidth(browser, width)));
    results.sort((a, b) => b.width - a.width).forEach(result => console.log(JSON.stringify(result)));
    if (failures.length) {
      console.error(`FAIL — ${failures.length} alignment regressions:\n${failures.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log('PASS — cards/table for both entity tabs, responsive toolbar, mobile filter open/close, structure enter/leave, collapsed entry, shared hierarchy/parent/incoming columns, uniform Headline 2 SB for collapsed/expanded process and client-path hierarchies, loaded 24px first-line icons, long-title wrapping without overlap, hover, populated owners, counters and table labels at 1920/1440/1024/390/320px.');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
