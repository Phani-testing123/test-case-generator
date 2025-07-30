import * as XLSX from 'xlsx';

export const exportExcel = (testCases) => {
  const wsData = testCases.map((tc, index) => ({
    "Test Case #": index + 1,
    Scenario: tc.scenario,
    Steps: tc.steps.join('\n'),
    Expected: tc.expected,
    Type: tc.type
  }));

  const worksheet = XLSX.utils.json_to_sheet(wsData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

  XLSX.writeFile(workbook, 'gherkin_test_cases.xlsx');
};