import assert from "node:assert/strict";
export async function checkDiscoveryLayout(page, { widths = [320,393,430,1280,1920], screenshotDir, name = "discovery" } = {}) {
  const original=page.viewportSize();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 852 });
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => ({ viewport:innerWidth, document:document.documentElement.scrollWidth, badTargets:[...document.querySelectorAll("main button, main input:not([type=checkbox]), main select, header button")].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43;}).map(element=>({text:element.textContent?.slice(0,70),height:element.getBoundingClientRect().height})) }));
    assert(geometry.document<=geometry.viewport+1,`${name} overflow at ${width}px: ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.badTargets,[],`${name} touch targets at ${width}px`);
    if(screenshotDir && width===393)await page.screenshot({path:`${screenshotDir}/${name}-393.png`,fullPage:true});
  }
  if(original)await page.setViewportSize(original);
}
