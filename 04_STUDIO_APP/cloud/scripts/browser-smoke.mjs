import {chromium} from '@playwright/test';import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4322');await page.locator('#login-status').filter({hasText:'Conectando'}).waitFor({state:'hidden',timeout:15000}).catch(()=>{});
await page.getByRole('heading',{name:'Tu próximo contenido.'}).waitFor();
if(await page.locator('#studio-shell').isVisible())throw new Error('Interfaz privada visible sin login');
await page.getByLabel('Email',{exact:true}).fill('invalid@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill('invalid-password');await page.getByRole('button',{name:'Entrar al Estudio'}).click();
await page.getByText('Email o contraseña incorrectos.').waitFor({timeout:15000});
await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/login-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/login-mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Desbordamiento horizontal móvil');
if(errors.length)throw new Error(errors.join('; '));console.log('OK login desktop/móvil, rechazo de sesión inválida y sin errores JavaScript.');
}finally{await browser.close();}
