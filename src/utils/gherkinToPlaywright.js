// src/utils/gherkinToPlaywright.js

export function gherkinToPlaywright(scenario) {
  let code = `test('${scenario.title}', async ({ page }) => {\n`;
  scenario.lines.forEach(line => {
    const l = line.toLowerCase();
    if (l.includes('logged in')) {
      code += `  await page.goto('https://your-dev-url.com/login');\n`;
      code += `  await page.fill('#email', 'testuser@example.com');\n`;
      code += `  await page.fill('#password', 'Password1!');\n`;
      code += `  await page.click('#login');\n`;
    } else if (l.includes('store locator') || l.includes('selects a location')) {
      code += `  // TODO: Add store locator interaction here\n`;
    } else if (l.includes('adds') && l.includes('cart')) {
      code += `  // TODO: Add menu item to cart\n`;
    } else if (l.includes('proceeds to the payment page')) {
      code += `  // TODO: Proceed to payment page\n`;
    } else if (l.startsWith('when ')) {
      code += `  // ${line}\n`;
    } else if (l.startsWith('then ') || l.startsWith('and ')) {
      code += `  // Assert: ${line}\n`;
    } else {
      code += `  // ${line}\n`;
    }
  });
  code += `});\n\n`;
  return code;
}

export function exportAllPlaywright(scenarios) {
  let allCode = `// Auto-generated Playwright tests\nimport { test, expect } from '@playwright/test';\n\n`;
  scenarios.forEach(scenario => {
    allCode += gherkinToPlaywright(scenario);
  });
  return allCode;
}
