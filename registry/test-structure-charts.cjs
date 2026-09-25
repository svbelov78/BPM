/* Updated chart geometry and source-data invariants. Optional browser geometry:
 * BPM_PLAYWRIGHT=/path/to/playwright node test-structure-charts.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window: {}};
const read = filename => fs.readFileSync(path.join(__dirname, filename), 'utf8');
for (const file of ['structure-source.js', 'structure-data.js', 'structure-charts.js']) vm.runInNewContext(read(file), context);
const {layout, render} = context.window.BPMStructureCharts;
const close = (actual, expected, label, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} / ${expected}`);

for (const name of ['BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS']) {
  const model = context.window[name];
  for (const node of model.nodes) {
    const comparison = layout(node.buckets, model.maxima, '1');
    const distribution = layout(node.buckets, model.maxima, '2');
    assert.equal(comparison.plotWidth, 363);
    assert.equal(comparison.gap, 8);
    assert.equal(comparison.segments.length, 5);
    close(comparison.segments.reduce((sum, segment) => sum + segment.width, 0) + 32, 363, 'Chart 1 width');
    comparison.segments.forEach(segment => {
      assert.equal(segment.count, node.buckets[segment.index]);
      close(segment.ratio, model.maxima[segment.index] ? segment.count / model.maxima[segment.index] : 0, 'Source leader ratio');
    });
    assert.equal(distribution.plotWidth, 364);
    assert.equal(distribution.gap, 4);
    assert.equal(distribution.segments.reduce((sum, segment) => sum + segment.count, 0), node.total);
    if (node.total) close(distribution.segments.reduce((sum, segment) => sum + segment.width, 0) + 4 * (distribution.segments.length - 1), 364, 'Chart 2 width');
    for (const segment of distribution.segments) assert.equal(segment.ratio, 1);
  }
}
assert.equal(layout([0, 0, 0, 0, 0], [], '2').segments.length, 0);
assert.equal(layout([0, 0, 5, 0, 0], [], '2').segments[0].width, 364);
assert.ok(layout([1, 999, 0, 0, 0], [], '2').segments[0].width < 1, 'Tiny bars retain the actual fraction');
assert.ok(layout([], [], '1').segments.every(segment => Number.isFinite(segment.width) && segment.ratio === 0));
const example = layout([30, 30, 20, 10, 10], [], '2');
example.segments.forEach((segment, index) => close(segment.width, [104.4, 104.4, 69.6, 34.8, 34.8][index], 'Figma Chart 2 sample'));
const markup = render({id: 'test" onmouseover="alert(1)', buckets: [30, 30, 20, 10, 10], type: '2'});
assert.match(markup, /data-chart="test&quot; onmouseover=&quot;alert\(1\)"/);
assert.equal((markup.match(/data-structure-number=/g) || []).length, 6, 'All six counters retain animation hooks');
assert.equal((markup.match(/data-fill=/g) || []).length, 5);
assert.ok(!markup.includes('is-narrow'), 'Narrow positive values are not silently hidden');
assert.ok(markup.includes('--structure-fill-ratio:0'), 'Unrated outline starts at zero');
console.log('PASS — chart widths, source counts, leader ratios, normalized fractions, zero/tiny data and animation hooks');

if (process.env.BPM_PLAYWRIGHT) (async () => {
  const {chromium} = require(process.env.BPM_PLAYWRIGHT);
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1000, height: 400}});
    await page.setContent('<style>:root{--text:#1a1a1a;--border:#d1d9e6}body{font-family:Arial}*{box-sizing:border-box}.sample{width:422px;margin:24px}</style><div id="one" class="sample"></div><div id="two" class="sample"></div>');
    for (const file of ['structure.css', 'efficiency-palette.css', 'structure-charts.css']) await page.addStyleTag({content: read(file)});
    await page.addScriptTag({content: read('structure-charts.js')});
    await page.evaluate(() => {
      for (const [id, type] of [['one', '1'], ['two', '2']]) document.getElementById(id).innerHTML = window.BPMStructureCharts.render({id, buckets: [30, 30, 20, 10, 10], maxima: [100, 60, 30, 50, 20], type, done: true});
    });
    for (const [id, plotWidth, gap] of [['one', 363, 8], ['two', 364, 4]]) {
      const measured = await page.locator(`#${id} .structure-chart`).evaluate(chart => {
        const rectangle = chart.getBoundingClientRect(), plot = chart.querySelector('.structure-bars'), total = chart.querySelector('.structure-total');
        return {
          height: rectangle.height, plot: plot.getBoundingClientRect().width, gap: parseFloat(getComputedStyle(plot).gap),
          totalBottom: total.getBoundingClientRect().bottom - rectangle.bottom,
          totalFont: getComputedStyle(total).fontSize, totalLine: getComputedStyle(total).lineHeight,
          segments: [...chart.querySelectorAll('.structure-segment')].map(segment => {
            const track = segment.querySelector('.structure-track'), counter = segment.querySelector('.structure-segment-count');
            return {height: track.getBoundingClientRect().height, radius: getComputedStyle(track).borderRadius, numberVisible: getComputedStyle(counter).visibility, countGap: track.getBoundingClientRect().top - counter.getBoundingClientRect().bottom, background: getComputedStyle(track, '::before').content, opacity: getComputedStyle(track, '::before').opacity};
          })
        };
      });
      close(measured.height, 42, 'Chart height');
      close(measured.plot, plotWidth, 'Plot width');
      close(measured.gap, gap, 'Segment gap');
      close(measured.totalBottom, 0, 'Total uses the shared bottom baseline');
      assert.equal(measured.totalFont, '17px'); assert.equal(measured.totalLine, '24px');
      measured.segments.forEach(segment => {
        close(segment.height, 22, 'All bars are 22 px'); close(segment.countGap, 2, 'Count gap');
        assert.equal(segment.radius, '2px'); assert.equal(segment.numberVisible, 'visible');
      });
      if (id === 'one') {
        assert.equal(measured.segments[0].opacity, '0.25'); assert.equal(measured.segments[1].opacity, '0.15');
        assert.equal(measured.segments[4].background, 'none');
      } else assert.ok(measured.segments.every(segment => segment.background === 'none'));
    }
    await page.screenshot({path: '/private/tmp/bpm-structure-charts-updated.png'});
    console.log('PASS — browser geometry: 42 px charts / 22 px bars, baseline, typography, track opacities and unscaled unrated outline');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
