
// Generate a smart feature name from the requirement or scenarios
export function generateFeatureName(scenarios, requirement = "") {
  if (requirement && requirement.length > 0) {
    // Use requirement or user story as base (first line, cleaned)
    return requirement.split('\n')[0].replace(/[^a-z0-9 ]/gi, '').trim();
  }
  if (scenarios && scenarios.length > 0) {
    // Use first scenario’s title as a fallback
    let title = scenarios[0].title || '';
    // Remove common prefixes
    title = title.replace(/(User|Guest|Customer)\s+/i, '');
    // Extract first key action, capitalize words
    return title.split(' ').slice(0, 5).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  }
  return 'AI Generated Feature';
}

// Convert a single scenario to Gherkin text
export function scenarioToFeature(scenario, featureName = '') {
  let featureText = '';
  if (featureName) {
    featureText += `Feature: ${featureName}\n\n`;
  }
  featureText += `Scenario: ${scenario.title}\n`;
  scenario.lines.forEach(line => {
    featureText += `${line}\n`;
  });
  return featureText;
}


// Export all scenarios as a .feature file with dynamic feature name
export function exportAllAsFeatureFile(scenarios, requirement = "") {
  const featureName = generateFeatureName(scenarios, requirement);
  let featureFile = `Feature: ${featureName}\n\n`;
  scenarios.forEach(scenario => {
    featureFile += scenarioToFeature(scenario);
  });
  return featureFile;
}
