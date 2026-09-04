/* ------------------------------------------------------------------
   Reference data for the service desk platform.

   Everything in here is editable from the "Reference data" tab in the
   app (changes are saved to the browser). Editing this file changes
   the defaults that ship with the repo — i.e. what a brand new browser
   sees, and what "Reset reference data" restores.
   ------------------------------------------------------------------ */

window.SDP_DEFAULT_CONFIG = {
  version: 1,
  organisation: 'Service Desk',

  /* The 22 systems. `no` is the system number (1-22) the desk quotes,
     `idPrefix` / `idPattern` describe the shape of that system's own id,
     which differs from system to system. Pattern is advisory: a ticket
     whose id does not match is still accepted, it is just flagged. */
  systems: [
    { no: 1,  name: 'SAP ERP Finance',            idPrefix: 'FS',  idPattern: '^FS-?\\d{5,6}$',      idExample: 'FS-104233' },
    { no: 2,  name: 'Maximo Asset Management',    idPrefix: 'MX',  idPattern: '^MX-?\\d{4,6}$',      idExample: 'MX-20481' },
    { no: 3,  name: 'SCADA Telemetry',            idPrefix: 'SC',  idPattern: '^SC-?\\d{3,5}$',      idExample: 'SC-4471' },
    { no: 4,  name: 'GIS Network Mapping',        idPrefix: 'GIS', idPattern: '^GIS-?\\d{4,6}$',     idExample: 'GIS-88120' },
    { no: 5,  name: 'Customer Billing (CIS)',     idPrefix: 'CIS', idPattern: '^CIS-?\\d{6,8}$',     idExample: 'CIS-30044821' },
    { no: 6,  name: 'Salesforce CRM',             idPrefix: 'SF',  idPattern: '^SF-?[A-Z0-9]{6,10}$',idExample: 'SF-A0K7B21' },
    { no: 7,  name: 'ServiceNow ITSM',            idPrefix: 'SN',  idPattern: '^SN-?\\d{6,8}$',      idExample: 'SN-4410023' },
    { no: 8,  name: 'Workforce Scheduling',       idPrefix: 'WS',  idPattern: '^WS-?\\d{4,6}$',      idExample: 'WS-71204' },
    { no: 9,  name: 'Laboratory LIMS',            idPrefix: 'LB',  idPattern: '^LB-?\\d{5,7}$',      idExample: 'LB-220741' },
    { no: 10, name: 'Water Quality Portal',       idPrefix: 'WQ',  idPattern: '^WQ-?\\d{4,6}$',      idExample: 'WQ-13350' },
    { no: 11, name: 'Field Mobile App',           idPrefix: 'FM',  idPattern: '^FM-?\\d{4,6}$',      idExample: 'FM-60712' },
    { no: 12, name: 'Document Management',        idPrefix: 'DM',  idPattern: '^DM-?\\d{5,7}$',      idExample: 'DM-880231' },
    { no: 13, name: 'HR & Payroll',               idPrefix: 'HR',  idPattern: '^HR-?\\d{4,6}$',      idExample: 'HR-40910' },
    { no: 14, name: 'Procurement Portal',         idPrefix: 'PR',  idPattern: '^PR-?\\d{5,7}$',      idExample: 'PR-201880' },
    { no: 15, name: 'Data Warehouse & BI',        idPrefix: 'BI',  idPattern: '^BI-?\\d{4,6}$',      idExample: 'BI-30291' },
    { no: 16, name: 'Identity & Access (AD)',     idPrefix: 'IAM', idPattern: '^IAM-?\\d{4,6}$',     idExample: 'IAM-55120' },
    { no: 17, name: 'Email & Collaboration',      idPrefix: 'EC',  idPattern: '^EC-?\\d{5,7}$',      idExample: 'EC-771043' },
    { no: 18, name: 'Contact Centre Telephony',   idPrefix: 'CC',  idPattern: '^CC-?\\d{4,6}$',      idExample: 'CC-90233' },
    { no: 19, name: 'Network & Connectivity',     idPrefix: 'NW',  idPattern: '^NW-?\\d{4,6}$',      idExample: 'NW-12094' },
    { no: 20, name: 'Print & Output Management',  idPrefix: 'PO',  idPattern: '^PO-?\\d{4,6}$',      idExample: 'PO-33418' },
    { no: 21, name: 'Payment Gateway',            idPrefix: 'PG',  idPattern: '^PG-?\\d{6,8}$',      idExample: 'PG-70022841' },
    { no: 22, name: 'Regulatory Reporting',       idPrefix: 'RG',  idPattern: '^RG-?\\d{4,6}$',      idExample: 'RG-60117' }
  ],

  /* The 10 business units. A ticket can impact more than one. */
  businessUnits: [
    { no: 1,  name: 'Customer Operations',     short: 'Cust Ops' },
    { no: 2,  name: 'Field Operations',        short: 'Field Ops' },
    { no: 3,  name: 'Water Production',        short: 'Production' },
    { no: 4,  name: 'Wastewater',              short: 'Wastewater' },
    { no: 5,  name: 'Asset Management',        short: 'Assets' },
    { no: 6,  name: 'Finance',                 short: 'Finance' },
    { no: 7,  name: 'People & HR',             short: 'HR' },
    { no: 8,  name: 'IT & Digital',            short: 'IT' },
    { no: 9,  name: 'Regulation & Compliance', short: 'Regulation' },
    { no: 10, name: 'Commercial & Retail',     short: 'Commercial' }
  ],

  /* Four digit answer / resolution codes. */
  answerCodes: [
    { code: '1001', label: 'Password reset',                 category: 'Access' },
    { code: '1002', label: 'Account unlocked',               category: 'Access' },
    { code: '1010', label: 'Access rights granted',          category: 'Access' },
    { code: '1020', label: 'Access rights removed',          category: 'Access' },
    { code: '2001', label: 'Data correction applied',        category: 'Data' },
    { code: '2010', label: 'Interface message reprocessed',  category: 'Data' },
    { code: '2020', label: 'Batch job re-run',               category: 'Data' },
    { code: '2030', label: 'Report re-published',            category: 'Data' },
    { code: '3001', label: 'Hardware replaced',              category: 'Infrastructure' },
    { code: '3010', label: 'Network fault resolved',         category: 'Infrastructure' },
    { code: '3020', label: 'Service restarted',              category: 'Infrastructure' },
    { code: '3030', label: 'Capacity increased',             category: 'Infrastructure' },
    { code: '4001', label: 'Defect raised to supplier',      category: 'Application' },
    { code: '4010', label: 'Known error - workaround given', category: 'Application' },
    { code: '4020', label: 'Configuration corrected',        category: 'Application' },
    { code: '4030', label: 'Patch / release applied',        category: 'Application' },
    { code: '5001', label: 'User guidance / training',       category: 'User' },
    { code: '5010', label: 'No fault found',                 category: 'User' },
    { code: '5020', label: 'Working as designed',            category: 'User' },
    { code: '6001', label: 'Change request raised',          category: 'Change' },
    { code: '6010', label: 'Referred to project team',       category: 'Change' },
    { code: '9999', label: 'Duplicate / cancelled',          category: 'Admin' }
  ],

  priorities: ['P1', 'P2', 'P3', 'P4'],
  statuses:   ['Open', 'In progress', 'Pending customer', 'Resolved', 'Closed'],
  channels:   ['Phone', 'Email', 'Portal', 'Walk-up', 'Monitoring alert', 'Photo capture']
};
