export function gherkinToWebdriverIO(scenario) {
  let code = `describe('${scenario.title}', () => {\n  it('should execute the scenario', async () => {\n`;

  scenario.lines.forEach(line => {
    const l = line.toLowerCase();
    if (l.includes('logged in')) {
      code += `    await browser.url('https://your-dev-url.com/login');\n`;
      code += `    await $('#email').setValue('testuser@example.com');\n`;
      code += `    await $('#password').setValue('Password1!');\n`;
      code += `    await $('#loginButton').click();\n`;
    } else if (l.includes('store locator') || l.includes('selects a location')) {
      code += `    // TODO: Add store locator interaction here\n`;
    } else if (l.includes('adds') && l.includes('cart')) {
      code += `    // TODO: Add menu item to cart\n`;
    } else if (l.includes('proceeds to the payment page')) {
      code += `    // TODO: Proceed to payment page\n`;
    } else if (l.startsWith('when ')) {
      code += `    // ${line}\n`;
    } else if (l.startsWith('then ') || l.startsWith('and ')) {
      code += `    // Assert: ${line}\n`;
    } else {
      code += `    // ${line}\n`;
    }
  });

  code += `  });\n});\n`;
  return code;
}

export function exportAllWebdriverIO(scenarios) {
  return scenarios.map(gherkinToWebdriverIO).join('\n\n');
}
