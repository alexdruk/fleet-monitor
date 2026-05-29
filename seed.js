const fs = require('fs');
const path = require('path');

// Seeded pseudo-random for reproducibility
let seed = 42;
function rand(min, max) {
  seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
  return Math.round(min + (seed / 0x7fffffff) * (max - min));
}
function randF(min, max, dec = 1) {
  seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
  return parseFloat((min + (seed / 0x7fffffff) * (max - min)).toFixed(dec));
}

const db = {
  users: [
    { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Jessica Thompson', email: 'j.thompson@amazon-fleet.com', phone: '+1 206-555-0192', avatar: 'JT', locationId: null },
    { id: 2, username: 'manager1', password: 'manager123', role: 'manager', name: 'Marcus Rivera', email: 'm.rivera@amazon-fleet.com', phone: '+1 310-555-0147', avatar: 'MR', locationId: 1 },
    { id: 3, username: 'manager2', password: 'manager123', role: 'manager', name: 'Sarah Chen', email: 's.chen@amazon-fleet.com', phone: '+1 503-555-0218', avatar: 'SC', locationId: 2 }
  ],
  locations: [
    { id: 1, fleetId: 'FLT-LAX-003', name: 'SoCal Express Fleet', city: 'Los Angeles, CA', managerId: 2 },
    { id: 2, fleetId: 'FLT-PDX-001', name: 'Pacific Northwest Prime', city: 'Portland, OR', managerId: 3 }
  ],
  reports: []
};

function getWeeks() {
  const weeks = [];
  let d = new Date('2026-01-05T00:00:00Z');
  for (let i = 0; i < 10; i++) {
    const start = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 6);
    const end = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
    weeks.push({ start, end, index: i });
  }
  return weeks;
}

// Volume multipliers per week (simulate seasonal variation)
const volMult  = [0.94, 0.98, 1.00, 1.02, 0.97, 1.01, 0.99, 1.05, 1.02, 1.04];
const revMult  = [0.93, 0.97, 1.00, 1.03, 0.96, 1.01, 1.00, 1.06, 1.03, 1.05];

function status(val, target, op) {
  if (op === 'gte') return val >= target ? '✔ On Target' : (val >= target * 0.97 ? '⚠ Monitor' : '✘ Below Target');
  if (op === 'lte') return val <= target ? '✔ On Target' : (val <= target * 1.05 ? '⚠ Monitor' : '✘ Below Target');
  return '—';
}

function generateReport(locId, week) {
  const i = week.index;
  const isLAX = locId === 1;
  const vm = volMult[i];
  const rm = revMult[i];

  const BASE = isLAX
    ? { veh: 72, drv: 74, routes: 467, del: 14720, rev: 1782400, fuel: 412300, labour: 498200, maint: 89400, ins: 54600, other: 180300 }
    : { veh: 48, drv: 50, routes: 312, del: 9840,  rev: 1187200, fuel: 276100, labour: 333400, maint: 59900, ins: 36500, other: 120700 };

  // Fleet & Vehicle
  const maintenance = rand(2, 5);
  const activeVeh   = BASE.veh - maintenance;
  const utilRate    = +(activeVeh / BASE.veh * 100).toFixed(1);
  const vehAge      = +(18 + i * 0.23 + (isLAX ? 0 : 1.8)).toFixed(1);

  // Routes
  const routesPlanned   = Math.round(BASE.routes * vm);
  const cancelled       = rand(2, 5);
  const rescheduled     = rand(1, 4);
  const routesCompleted = routesPlanned - cancelled - rand(0, 2);
  const compRate        = +(routesCompleted / routesPlanned * 100).toFixed(1);
  const avgDur          = randF(isLAX ? 6.7 : 5.9, isLAX ? 7.6 : 6.8);
  const avgMiles        = randF(isLAX ? 58 : 52, isLAX ? 68 : 64);

  // Deliveries
  const totalDel    = Math.round(BASE.del * vm);
  const failed      = rand(60, 105);
  const successful  = totalDel - failed;
  const onTime      = Math.round(successful * randF(0.961, 0.985, 3));
  const onTimeRate  = +(onTime / totalDel * 100).toFixed(1);
  const firstAtt    = +(successful / totalDel * 100).toFixed(1);
  const avgStops    = randF(isLAX ? 30.2 : 29.8, isLAX ? 33.8 : 33.2);
  const csat        = randF(4.51, 4.84, 2);
  const csatResponses = rand(2700, 3600);

  // Safety
  const activeDrivers  = BASE.drv - rand(1, 4);
  const drvComp        = randF(96.2, 99.4);
  const speeding       = rand(7, 19);
  const hardBrake      = rand(12, 30);
  const incidents      = rand(0, 4);
  const injuries       = incidents >= 4 ? 1 : 0;
  const avgHours       = randF(8.1, 9.3);

  // Financials
  const rev    = Math.round(BASE.rev * rm);
  const fuel   = Math.round(BASE.fuel   * (0.94 + vm * 0.07));
  const labour = Math.round(BASE.labour * (0.96 + vm * 0.05));
  const maint  = Math.round(BASE.maint  * randF(0.88, 1.12, 3));
  const ins    = Math.round(BASE.ins    * randF(0.94, 1.06, 3));
  const other  = Math.round(BASE.other  * randF(0.90, 1.13, 3));
  const totalCosts = fuel + labour + maint + ins + other;
  const ebitda = rev - totalCosts;
  const ebitdaPct = +(ebitda / rev * 100).toFixed(1);
  const netProfit = ebitda;
  const netPct    = +(netProfit / rev * 100).toFixed(1);
  const revPerDel = +(rev / totalDel).toFixed(2);
  const costPerDel = +(totalCosts / totalDel).toFixed(2);

  const m = (idx, label, value, target, stat, notes) => ({
    id: `m-${locId}-w${i}-${idx}`,
    label,
    value: String(value),
    target,
    status: stat,
    notes: notes || '',
    changes: []
  });

  return {
    id: `r-${locId}-${week.start}`,
    locationId: locId,
    weekStart: week.start,
    weekEnd: week.end,
    submittedBy: locId === 1 ? 2 : 3,
    submittedByName: locId === 1 ? 'Marcus Rivera' : 'Sarah Chen',
    submittedAt: new Date(week.end + 'T09:15:00Z').toISOString(),
    sections: [
      {
        id: 'fleet_ops', name: 'FLEET & VEHICLE OPERATIONS',
        metrics: [
          m(1,  'Total Vehicles in Fleet',        BASE.veh,   '—',                                  '—',                              'Registered DSP vehicles'),
          m(2,  'Active Vehicles (This Week)',      activeVeh,  `≥ ${isLAX?70:46}`,                  status(activeVeh, isLAX?70:46,'gte'), `${maintenance} vehicle(s) in maintenance`),
          m(3,  'Vehicles Under Maintenance',       maintenance,'≤ 4',                               status(maintenance,4,'lte'),     'Scheduled inspections'),
          m(4,  'Fleet Utilisation Rate (%)',       utilRate,   '≥ 95%',                             status(utilRate,95,'gte'),       ''),
          m(5,  'Avg Vehicle Age (months)',         vehAge,     '≤ 24',                              status(vehAge,24,'lte'),         ''),
        ]
      },
      {
        id: 'route_perf', name: 'ROUTE PERFORMANCE',
        metrics: [
          m(6,  'Total Routes Planned',            routesPlanned,  '—',       '—',                                     `Week of ${week.start}`),
          m(7,  'Routes Completed',                routesCompleted,`≥ ${Math.round(routesPlanned*0.98)}`, status(routesCompleted,routesPlanned*0.98,'gte'), ''),
          m(8,  'Routes Cancelled',                cancelled,       '≤ 5',    status(cancelled,5,'lte'),                'Weather / ops issues'),
          m(9,  'Routes Rescheduled',              rescheduled,     '≤ 5',    status(rescheduled,5,'lte'),              ''),
          m(10, 'Route Completion Rate (%)',        compRate,        '≥ 98%',  status(compRate,98,'gte'),                ''),
          m(11, 'Avg Route Duration (hrs)',         avgDur,          '≤ 7.5',  status(avgDur,7.5,'lte'),                 ''),
          m(12, 'Avg Miles per Route',              avgMiles,        '50–70',  '✔ On Target',                           ''),
        ]
      },
      {
        id: 'delivery_kpis', name: 'DELIVERY KPIs',
        metrics: [
          m(13, 'Total Delivery Attempts',         totalDel,   '—',      '—',                                  ''),
          m(14, 'Successful Deliveries',           successful, `≥ ${Math.round(BASE.del*0.99)}`, status(successful,BASE.del*0.99,'gte'), ''),
          m(15, 'On-Time Deliveries',              onTime,     `≥ ${Math.round(BASE.del*0.95)}`, status(onTime,BASE.del*0.95,'gte'),     ''),
          m(16, 'On-Time Delivery Rate (%)',        onTimeRate, '≥ 96%',  status(onTimeRate,96,'gte'),           ''),
          m(17, 'Failed Deliveries',               failed,     '≤ 100',  status(failed,100,'lte'),              `Absent: ${Math.round(failed*0.69)} | Access: ${Math.round(failed*0.31)}`),
          m(18, 'First-Attempt Success Rate (%)',   firstAtt,   '≥ 95%',  status(firstAtt,95,'gte'),             ''),
          m(19, 'Avg Stops per Route',              avgStops,   '28–34',  '✔ On Target',                        ''),
          m(20, 'Customer Satisfaction Score',      csat,       '≥ 4.5/5',status(csat,4.5,'gte'),               `Based on ${csatResponses} responses`),
        ]
      },
      {
        id: 'driver_safety', name: 'DRIVER & SAFETY',
        metrics: [
          m(21, 'Total Active Drivers',            activeDrivers,  '—',       '—',                                   `${BASE.drv-activeDrivers} on leave`),
          m(22, 'Driver Compliance Rate (%)',       drvComp,        '≥ 98%',   status(drvComp,98,'gte'),               'Seatbelt & speed scans'),
          m(23, 'Speeding Events',                  speeding,       '≤ 10',    status(speeding,10,'lte'),              ''),
          m(24, 'Hard-Braking Events',              hardBrake,      '≤ 20',    status(hardBrake,20,'lte'),             ''),
          m(25, 'Incidents / Accidents',            incidents,      '≤ 2',     status(incidents,2,'lte'),              incidents > 0 ? `${incidents} event(s) logged` : 'No incidents this week'),
          m(26, 'Recordable Injuries',              injuries,       '0',        injuries===0?'✔ On Target':'✘ Below Target', ''),
          m(27, 'Avg Driver Hours / Day',           avgHours,       '≤ 10',    status(avgHours,10,'lte'),              'DOT HOS compliant'),
        ]
      },
      {
        id: 'financials', name: 'FINANCIALS (USD)',
        metrics: [
          m(28, 'Gross Revenue',                   rev,       isLAX?'≥ $1.75M':'≥ $1.15M', status(rev,isLAX?1750000:1150000,'gte'), ''),
          m(29, 'Fuel Costs',                       fuel,      isLAX?'≤ $430K':'≤ $290K',   status(fuel,isLAX?430000:290000,'lte'),  ''),
          m(30, 'Labour Costs',                     labour,    isLAX?'≤ $510K':'≤ $345K',   status(labour,isLAX?510000:345000,'lte'),'Inc. overtime & benefits'),
          m(31, 'Vehicle Maintenance Costs',        maint,     isLAX?'≤ $95K':'≤ $65K',     status(maint,isLAX?95000:65000,'lte'),   ''),
          m(32, 'Insurance & Compliance',           ins,       isLAX?'≤ $60K':'≤ $40K',     status(ins,isLAX?60000:40000,'lte'),     ''),
          m(33, 'Other Operating Costs',            other,     isLAX?'≤ $200K':'≤ $135K',   status(other,isLAX?200000:135000,'lte'), 'Admin, comms, depot'),
          m(34, 'Total Operating Costs',            totalCosts,isLAX?'≤ $1.28M':'≤ $860K',  status(totalCosts,isLAX?1280000:860000,'lte'),''),
          m(35, 'EBITDA',                           ebitda,    isLAX?'≥ $480K':'≥ $310K',   status(ebitda,isLAX?480000:310000,'gte'),''),
          m(36, 'EBITDA Margin (%)',                ebitdaPct, '≥ 27%',                      status(ebitdaPct,27,'gte'),              ''),
          m(37, 'Net Profit',                       netProfit, isLAX?'≥ $430K':'≥ $280K',   status(netProfit,isLAX?430000:280000,'gte'),'Pre-tax'),
          m(38, 'Net Profit Margin (%)',             netPct,    '≥ 24%',                      status(netPct,24,'gte'),                 ''),
          m(39, 'Revenue per Delivery ($)',          revPerDel, '≥ $115',                     status(revPerDel,115,'gte'),             ''),
          m(40, 'Cost per Delivery ($)',             costPerDel,'≤ $90',                      status(costPerDel,90,'lte'),             ''),
        ]
      }
    ]
  };
}

// Generate reports
const weeks = getWeeks();
for (const week of weeks) {
  db.reports.push(generateReport(1, week));
  db.reports.push(generateReport(2, week));
}

// Add a few pre-seeded audit trail changes to demonstrate the feature
const r = (id) => db.reports.find(r => r.id === id);
const getMet = (report, secIdx, metIdx) => report.sections[secIdx].metrics[metIdx];

// Week 3 LAX: admin corrected Fleet Utilisation Rate
const w3lax = r('r-1-2026-01-19');
if (w3lax) {
  const met = getMet(w3lax, 0, 3);
  const oldVal = met.value;
  met.value = String(+(parseFloat(met.value) - 1.8).toFixed(1));
  met.changes.push({ changedAt:'2026-01-22T14:30:00.000Z', changedBy:1, changedByName:'Jessica Thompson', field:'value', oldValue:oldVal, newValue:met.value, remark:'Corrected after vehicle count audit — 2 vehicles misclassified as active' });
}

// Week 5 PDX: manager corrected Failed Deliveries
const w5pdx = r('r-2-2026-02-02');
if (w5pdx) {
  const met = getMet(w5pdx, 2, 4);
  const oldVal = met.value;
  met.value = String(parseInt(met.value) + 7);
  met.changes.push({ changedAt:'2026-02-06T11:00:00.000Z', changedBy:3, changedByName:'Sarah Chen', field:'value', oldValue:oldVal, newValue:met.value, remark:'Included 7 late-logged failures from Tue delivery batch' });
}

// Week 7 LAX: admin changed notes on Incidents
const w7lax = r('r-1-2026-02-16');
if (w7lax) {
  const met = getMet(w7lax, 3, 4);
  const oldNotes = met.notes;
  met.notes = 'Minor collision reported — driver suspended pending review. Insurance notified.';
  met.changes.push({ changedAt:'2026-02-19T09:45:00.000Z', changedBy:1, changedByName:'Jessica Thompson', field:'notes', oldValue:oldNotes, newValue:met.notes, remark:'Added follow-up details after safety review' });
}

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'data/db.json'), JSON.stringify(db, null, 2));
console.log(`✓ Seeded ${db.reports.length} reports across ${db.locations.length} fleets (${weeks.length} weeks each)`);
console.log('  Users: admin/admin123 | manager1/manager123 | manager2/manager123');
