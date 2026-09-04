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

  /* The 22 systems, as they appear on the configuration item sheet.
     `code` is that system's configuration item code — it belongs to the
     system, not to the ticket, so the ticket form fills it in for you.
     Systems 15-22 have no code recorded yet; add them here or on the
     Reference data tab and the app picks them up. */
  systems: [
    { no:  1, name: 'Castor',    code: 'CA-1'  },
    { no:  2, name: 'Bellatrix', code: 'BX-1'  },
    { no:  3, name: 'Zosma',     code: 'ZO-1'  },
    { no:  4, name: 'Nash',      code: 'NN-2'  },
    { no:  5, name: 'Sham',      code: 'SH-1'  },
    { no:  6, name: 'Rastaban',  code: 'RD-1'  },
    { no:  7, name: 'Polaris',   code: 'PO-1'  },
    { no:  8, name: 'Alshat',    code: 'AT-1'  },
    { no:  9, name: 'Nunki',     code: 'NN-1'  },
    { no: 10, name: 'Phad',      code: 'PD-1'  },
    { no: 11, name: 'Megrez',    code: 'MZ-1'  },
    { no: 12, name: 'Izar',      code: 'IZ-1'  },
    { no: 13, name: 'Electra',   code: 'EA-1'  },
    { no: 14, name: 'Tarazed',   code: 'TZ-1'  },
    { no: 15, name: 'Acubens',   code: ''      },
    { no: 16, name: 'Acamar',    code: ''      },
    { no: 17, name: 'Cheleb',    code: ''      },
    { no: 18, name: 'Capella',   code: ''      },
    { no: 19, name: 'Mars',      code: ''      },
    { no: 20, name: 'Neptune',   code: ''      },
    { no: 21, name: 'Pluto',     code: ''      },
    { no: 22, name: 'P2132-5',   code: ''      }
  ],

  /* The four business units. They are named exactly as they appear on
     the sheet — "1" to "4" — so a chart axis reads 1, 2, 3, 4. Give them
     words here and every chart, filter and export follows. */
  businessUnits: [
    { no: 1, name: '1', short: '1' },
    { no: 2, name: '2', short: '2' },
    { no: 3, name: '3', short: '3' },
    { no: 4, name: '4', short: '4' }
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
