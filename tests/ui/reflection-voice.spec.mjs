import { test, expect } from '@playwright/test';

test('daily reflection keeps mic in the lower right corner and does not replace typed text', async ({ page }) => {
  await page.goto('./');
  const field = page.locator('[data-reflection]');
  const mic = page.getByRole('button', { name: 'Ghi âm một chút nhìn lại' });
  await expect(field).toBeVisible();
  await expect(mic).toBeVisible();
  const textarea = await field.boundingBox();
  const microphone = await mic.boundingBox();
  expect(microphone.x).toBeGreaterThan(textarea.x + textarea.width / 2);
  expect(microphone.y).toBeGreaterThan(textarea.y + textarea.height / 2);
  await field.fill('Tôi đã ghi chú trước đó.');
  await mic.click();
  await expect(field).toHaveValue('Tôi đã ghi chú trước đó.');
  // A demo account cannot call the authenticated AI service.
  await expect(page.locator('#toast')).toContainText('Đăng nhập');
});

test('voice Send displays icon only, prevents dismissal, saves original and light polish', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const { createReflectionRecorder } = await import('./src/lib/reflection-voice.js');
    const sample = document.querySelector('[data-reflection]');
    window.savedVoice = [];
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => ({getTracks: () => [{ stop() {} }]})
    }});
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor(_stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      pause() { this.state = 'paused'; }
      resume() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array([26,69,223,163,0])], {type: this.mimeType}) });
          this.onstop?.();
        });
      }
    };
    window.testVoice = createReflectionRecorder({
      baseUrl:'https://example.com', root:document.body,
      authorize:async()=> 'mock-token',
      capture:()=>({date:'2026-11-24',owner:'test',base:sample.value,cursor:sample.value.length}),
      save:async p=>{window.savedVoice.push({mode:p.mode,text:p.text});return p.mode==='initial' ? {start:0,original:p.text} : p.checkpoint;},
      request:async(_base,_token,op)=>{
        if (op==='transcribe') {
          return await new Promise(resolve => {window.completeTranscribe=()=>resolve('hôm nay tôi đã hoàn thành 3 việc');});
        }
        return 'Hôm nay tôi đã hoàn thành 3 việc.';
      }
    });
    await window.testVoice.open();
  });
  await expect(page.getByRole('button', {name:'Tạm dừng'})).toBeVisible();
  await page.getByRole('button', {name:'Tạm dừng'}).click();
  await expect(page.getByRole('button', {name:'Tiếp tục'})).toBeVisible();
  await page.getByRole('button', {name:'Tiếp tục'}).click();
  await page.getByRole('button', {name:'Gửi bản ghi'}).click();
  const panel = page.locator('#reflection-voice-dialog');
  await expect(panel).toHaveAttribute('data-phase','processing');
  await expect(panel.locator('.rv-processing')).toBeVisible();
  await expect(panel.locator('.rv-spinner')).toBeVisible();
  await expect(panel.locator('.rv-heading')).toBeHidden();
  await expect(panel.locator('.rv-message')).toBeHidden();
  await expect(panel.locator('[data-rv=discard]')).toBeHidden();
  const bounds = await panel.boundingBox();
  expect(bounds.width).toBeLessThan(140);
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await page.evaluate(() => window.completeTranscribe());
  await expect(panel).toHaveCount(0);
  const saved=await page.evaluate(()=>window.savedVoice);
  expect(saved).toEqual([
    {mode:'initial',text:'hôm nay tôi đã hoàn thành 3 việc'},
    {mode:'polish',text:'Hôm nay tôi đã hoàn thành 3 việc.'},
  ]);
});
