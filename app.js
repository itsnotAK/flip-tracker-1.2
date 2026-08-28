(() => {
  'use strict';
  const STORAGE_KEY = 'flip_tracker_clean_v1';
  const STAGES = ['sourced', 'recon', 'listed', 'sold'];
  const STAGE_LABELS = { sourced: 'SOURCED', recon: 'IN RECON', listed: 'LISTED', sold: 'SOLD' };
  const STAGE_COLORS = { sourced: 'var(--yellow)', recon: 'var(--orange)', listed: 'var(--blue)', sold: 'var(--green)' };
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
  const num = value => Number(value) || 0;
  const money = value => num(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const today = () => new Date().toISOString().slice(0, 10);
  let selectedId = null;
  let activeTab = 'buying';
  let cars = loadCars().map(normalizeCar);

  function emptyCar() {
    return {
      id: uid(), vin: '', year: '', make: '', model: '', trim: '', mileage: '', stage: 'sourced',
      purchase: { sourceType: 'Auction', seller: '', purchaseDate: '', paymentMethod: 'Cash', purchasePrice: '', auctionFees: '', taxes: '', transportation: '' },
      inspection: { damageNotes: '', diagnosticCodes: '', mechanicalInspection: '', estimatedRepairBudget: '', photos: [] },
      documents: { titleStatus: 'Clean', titleReceivedDate: '', notes: '', files: [] },
      parts: [], repairs: [], holdingCosts: [],
      listing: { minimumPrice: '', askingPrice: '', listingDate: '', marketplaceLinks: '', comps: [], photos: [] },
      leads: [], teamTasks: [],
      sale: { salePrice: '', saleDate: '', paymentStatus: 'Not paid', sellingFees: '', titleTransferStatus: 'Not started', billOfSale: null }
    };
  }
  function normalizeCar(raw) {
    const base = emptyCar();
    const legacyNeeds = (raw.needs || []).map(item => ({
      id: item.id || uid(), work: item.task || 'Repair', laborCost: item.cost || '', vendor: '', appointment: '', dueDate: '', status: item.done ? 'Completed' : 'Needed', receipt: null
    }));
    return {
      ...base, ...raw,
      purchase: {
        ...base.purchase, ...(raw.purchase || {}),
        sourceType: raw.purchase?.sourceType || raw.sourceType || 'Auction',
        seller: raw.purchase?.seller || raw.seller || raw.source || '',
        purchaseDate: raw.purchase?.purchaseDate || raw.purchaseDate || '',
        paymentMethod: raw.purchase?.paymentMethod || raw.paymentMethod || 'Cash',
        purchasePrice: raw.purchase?.purchasePrice || raw.purchasePrice || '',
        auctionFees: raw.purchase?.auctionFees || raw.auctionFees || '',
        taxes: raw.purchase?.taxes || raw.taxes || '',
        transportation: raw.purchase?.transportation || raw.transportation || ''
      },
      inspection: { ...base.inspection, ...(raw.inspection || {}), photos: raw.inspection?.photos || [] },
      documents: {
        ...base.documents, ...(raw.documents || {}), files: raw.documents?.files || [],
        titleStatus: raw.documents?.titleStatus || raw.titleStatus || 'Clean'
      },
      parts: (raw.parts || []).map(part => ({
        id: part.id || uid(), name: part.name || 'Part', partNumber: part.partNumber || '', supplier: part.supplier || '',
        price: part.price ?? '', orderDate: part.orderDate || '', deliveryStatus: part.deliveryStatus || (part.purchased ? 'Delivered' : 'Needed'),
        returnStatus: part.returnStatus || 'Not returned',
        receipt: typeof part.receipt === 'string' ? { id: uid(), name: 'Receipt photo', data: part.receipt } : (part.receipt || null)
      })),
      repairs: raw.repairs || legacyNeeds,
      holdingCosts: raw.holdingCosts || [],
      listing: { ...base.listing, ...(raw.listing || {}), comps: raw.listing?.comps || raw.comps || [], photos: raw.listing?.photos || [] },
      leads: raw.leads || [],
      teamTasks: raw.teamTasks || [],
      sale: {
        ...base.sale, ...(raw.sale || {}),
        salePrice: raw.sale?.salePrice || raw.soldPrice || '',
        saleDate: raw.sale?.saleDate || raw.soldDate || ''
      }
    };
  }
  function loadCars() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
  function saveCars(redrawDetail = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
      renderBoard();
      if (redrawDetail && $('detailDialog').open) renderDetail();
    } catch {
      alert('This browser could not save more data. Remove some photos/documents or use smaller files. Cloud storage will remove this limit later.');
    }
  }
  function selectedCar() { return cars.find(car => car.id === selectedId); }
  function carTitle(car) { return [car.year, car.make, car.model, car.trim].filter(Boolean).join(' ') || 'Untitled car'; }
  function daysHeld(car) {
    if (!car.purchase.purchaseDate) return 0;
    const end = car.sale.saleDate || today();
    const days = Math.round((new Date(end) - new Date(car.purchase.purchaseDate)) / 86400000);
    return Number.isFinite(days) && days > 0 ? days : 0;
  }
  function costs(car) {
    const acquisition = num(car.purchase.purchasePrice) + num(car.purchase.auctionFees) + num(car.purchase.taxes) + num(car.purchase.transportation);
    const parts = car.parts.reduce((sum, item) => sum + num(item.price), 0);
    const repairs = car.repairs.reduce((sum, item) => sum + num(item.laborCost), 0);
    const holding = car.holdingCosts.reduce((sum, item) => sum + num(item.amount), 0);
    const selling = num(car.sale.sellingFees);
    const allIn = acquisition + parts + repairs + holding + selling;
    const profit = num(car.sale.salePrice) - allIn;
    return { acquisition, parts, repairs, holding, selling, allIn, profit, roi: allIn ? (profit / allIn) * 100 : 0 };
  }
  function summaryRows(car) {
    const c = costs(car);
    return `<div class="summary">
      <div class="line"><span>Acquisition</span><b>${money(c.acquisition)}</b></div>
      <div class="line"><span>Parts</span><b>${money(c.parts)}</b></div>
      <div class="line"><span>Repairs/labor</span><b>${money(c.repairs)}</b></div>
      <div class="line"><span>Holding costs</span><b>${money(c.holding)}</b></div>
      <div class="line"><span>Selling fees</span><b>${money(c.selling)}</b></div>
      <div class="line"><span>All-in cost</span><b>${money(c.allIn)}</b></div>
    </div>`;
  }
  function renderBoard() {
    const active = cars.filter(car => car.stage !== 'sold');
    const sold = cars.filter(car => car.stage === 'sold');
    const invested = active.reduce((sum, car) => sum + costs(car).allIn, 0);
    const profit = sold.reduce((sum, car) => sum + costs(car).profit, 0);
    const avgDays = sold.length ? Math.round(sold.reduce((sum, car) => sum + daysHeld(car), 0) / sold.length) : 0;
    $('stats').innerHTML = [
      ['Active inventory', active.length], ['Invested (active)', money(invested)], ['Realized profit', money(profit)],
      ['Cars sold', sold.length], ['Average days held', avgDays || '—'], ['All vehicles', cars.length]
    ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('board').innerHTML = STAGES.map(stage => {
      const stageCars = cars.filter(car => car.stage === stage);
      return `<section class="column"><header class="column-head" style="color:${STAGE_COLORS[stage]}"><span>${STAGE_LABELS[stage]}</span><span class="count">${stageCars.length}</span></header><div class="cards">${stageCars.length ? stageCars.map(cardHtml).join('') : '<div class="empty">No vehicles here</div>'}</div></section>`;
    }).join('');
  }
  function cardHtml(car) {
    const c = costs(car);
    const pending = car.repairs.filter(item => item.status !== 'Completed').length + car.parts.filter(item => item.deliveryStatus !== 'Delivered').length + car.teamTasks.filter(item => item.status !== 'Done').length;
    return `<article class="card" data-open-car="${car.id}"><button class="delete" data-delete-car="${car.id}" aria-label="Delete">×</button>
      <div class="card-title">${esc(carTitle(car))}</div><div class="card-sub">${car.vin ? 'VIN …' + esc(car.vin.slice(-6)) : 'No VIN'} · ${car.mileage ? Number(car.mileage).toLocaleString() + ' mi' : 'No mileage'}</div>
      <div class="card-grid"><div class="line"><span>All-in cost</span><b>${money(c.allIn)}</b></div><div class="line"><span>Pending items</span><b>${pending}</b></div><div class="line"><span>Days held</span><b>${daysHeld(car)}</b></div>${car.stage === 'sold' ? `<div class="line"><span>Net profit</span><b class="profit">${money(c.profit)}</b></div>` : ''}</div></article>`;
  }

  $('board').addEventListener('click', event => {
    const remove = event.target.closest('[data-delete-car]');
    if (remove) {
      event.stopPropagation();
      if (confirm('Delete this vehicle and all of its records?')) { cars = cars.filter(car => car.id !== remove.dataset.deleteCar); saveCars(); }
      return;
    }
    const card = event.target.closest('[data-open-car]');
    if (card) openCar(card.dataset.openCar);
  });
  $('newCarBtn').onclick = () => {
    $('intakeForm').reset(); $('intakeError').textContent = ''; $('vinStatus').textContent = '0/17 characters'; $('vinStatus').className = '';
    updateAuctionFeeField('Auction');
    $('intakeDialog').showModal();
  };
  function isNonAuctionSource(sourceType) { return ['Private seller', 'Trade-in'].includes(sourceType); }
  function updateAuctionFeeField(sourceType) {
    const disabled = isNonAuctionSource(sourceType);
    $('auctionFees').disabled = disabled;
    $('auctionFeesField').classList.toggle('disabled-field', disabled);
    if (disabled) $('auctionFees').value = '';
  }
  $('sourceType').onchange = event => updateAuctionFeeField(event.target.value);
  document.querySelectorAll('[data-close="intake"]').forEach(button => button.onclick = () => $('intakeDialog').close());
  $('vin').oninput = event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
    $('vinStatus').textContent = event.target.value.length + '/17 characters';
  };
  $('decodeBtn').onclick = async () => {
    const vin = $('vin').value;
    if (vin.length !== 17) { $('vinStatus').textContent = 'Enter a complete 17-character VIN.'; $('vinStatus').className = 'error'; return; }
    $('decodeBtn').disabled = true; $('vinStatus').textContent = 'Looking up VIN…';
    try {
      const response = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + encodeURIComponent(vin) + '?format=json');
      if (!response.ok) throw new Error();
      const vehicle = (await response.json()).Results?.[0];
      if (!vehicle?.Make || !vehicle?.Model || !vehicle?.ModelYear) throw new Error();
      $('year').value = vehicle.ModelYear; $('make').value = vehicle.Make; $('model').value = vehicle.Model; $('trim').value = vehicle.Trim || vehicle.Series || '';
      $('vinStatus').textContent = `Found: ${vehicle.ModelYear} ${vehicle.Make} ${vehicle.Model}`; $('vinStatus').className = 'good';
    } catch { $('vinStatus').textContent = 'Could not decode this VIN. Check it and try again.'; $('vinStatus').className = 'error'; }
    finally { $('decodeBtn').disabled = false; }
  };
  $('intakeForm').onsubmit = event => {
    event.preventDefault();
    const value = id => $(id).value.trim();
    if (!value('make') || !value('model')) { $('intakeError').textContent = 'Enter at least the make and model.'; return; }
    const car = emptyCar();
    Object.assign(car, { vin: value('vin'), year: value('year'), make: value('make'), model: value('model'), trim: value('trim'), mileage: value('mileage') });
    Object.assign(car.purchase, { sourceType: value('sourceType'), seller: value('seller'), purchaseDate: value('purchaseDate'), paymentMethod: value('paymentMethod'), purchasePrice: value('purchasePrice'), auctionFees: value('auctionFees'), taxes: value('taxes'), transportation: value('transportation') });
    car.documents.titleStatus = value('titleStatus');
    cars.push(car); saveCars(); $('intakeDialog').close();
  };

  const TABS = [
    ['buying', 'Buying'], ['inspection', 'Inspection'], ['documents', 'Title & Docs'], ['parts', 'Parts'],
    ['repairs', 'Repairs'], ['tasks', 'Team Tasks'], ['holding', 'Holding'], ['listing', 'Listing'], ['leads', 'Leads'], ['sale', 'Sale']
  ];
  function openCar(id) { selectedId = id; activeTab = 'buying'; renderDetail(); $('detailDialog').showModal(); }
  function renderDetail() {
    const car = selectedCar();
    if (!car) return $('detailDialog').close();
    const renderer = { buying: buyingTab, inspection: inspectionTab, documents: documentsTab, parts: partsTab, repairs: repairsTab, tasks: tasksTab, holding: holdingTab, listing: listingTab, leads: leadsTab, sale: saleTab }[activeTab];
    $('detailContent').innerHTML = `<header class="modal-head"><div><h2>${esc(carTitle(car))}</h2><p>${car.vin ? 'VIN ' + esc(car.vin) : 'No VIN'} · ${STAGE_LABELS[car.stage]}</p></div><button class="icon-btn" data-detail-close>×</button></header>
      <nav class="tabs">${TABS.map(([key, label]) => `<button class="tab ${activeTab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</nav>
      <section id="tabContent">${renderer(car)}</section>`;
  }
  function input(label, path, value, type = 'text', extra = '') {
    return `<label class="field"><span>${label}</span><input type="${type}" data-path="${path}" value="${esc(value)}" ${extra}></label>`;
  }
  function select(label, path, value, options) {
    return `<label class="field"><span>${label}</span><select data-path="${path}">${options.map(option => `<option ${option === value ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
  }
  function buyingTab(car) {
    return `<p class="section-note">Purchase source and every acquisition cost paid before repairs begin.</p><div class="form-grid">
      ${input('VIN', 'vin', car.vin)}${input('Year', 'year', car.year)}${input('Make', 'make', car.make)}${input('Model', 'model', car.model)}${input('Trim', 'trim', car.trim)}${input('Mileage', 'mileage', car.mileage, 'number', 'min="0"')}
      ${select('Purchase source', 'purchase.sourceType', car.purchase.sourceType, ['Auction', 'Private seller', 'Trade-in', 'Dealer', 'Other'])}${input('Seller / auction name', 'purchase.seller', car.purchase.seller)}${input('Purchase date', 'purchase.purchaseDate', car.purchase.purchaseDate, 'date')}
      ${select('Payment method', 'purchase.paymentMethod', car.purchase.paymentMethod, ['Cash', "Cashier's check", 'Wire transfer', 'Financing', 'Other'])}
      ${input('Purchase price', 'purchase.purchasePrice', car.purchase.purchasePrice, 'number', 'min="0" step=".01"')}<label class="field ${isNonAuctionSource(car.purchase.sourceType) ? 'disabled-field' : ''}"><span>Auction fees</span><input type="number" data-path="purchase.auctionFees" value="${esc(car.purchase.auctionFees)}" min="0" step=".01" ${isNonAuctionSource(car.purchase.sourceType) ? 'disabled' : ''}></label>${input('Taxes', 'purchase.taxes', car.purchase.taxes, 'number', 'min="0" step=".01"')}${input('Transportation / towing', 'purchase.transportation', car.purchase.transportation, 'number', 'min="0" step=".01"')}
      </div>${summaryRows(car)}<div class="stage-actions">${STAGES.map(stage => `<button class="btn ${stage === car.stage ? 'primary' : ''}" data-stage="${stage}">${STAGE_LABELS[stage]}</button>`).join('')}</div>`;
  }
  function photoStrip(photos, kind) {
    return `<div class="thumbs">${photos.map(photo => `<div class="thumb-wrap"><img class="thumb" src="${photo.data}" alt="${esc(photo.name)}" data-view-file="${photo.id}" data-file-kind="${kind}"><button class="thumb-remove" data-remove-file="${photo.id}" data-file-kind="${kind}">×</button></div>`).join('')}</div>`;
  }
  function inspectionTab(car) {
    return `<p class="section-note">Document the condition before work begins. Add exterior, interior, dashboard, engine, and damage photos.</p><div class="form-grid">
      <label class="field full"><span>Damage notes</span><textarea data-path="inspection.damageNotes">${esc(car.inspection.damageNotes)}</textarea></label>
      <label class="field full"><span>Diagnostic codes</span><textarea data-path="inspection.diagnosticCodes" placeholder="Example: P0420 — Catalyst efficiency">${esc(car.inspection.diagnosticCodes)}</textarea></label>
      <label class="field full"><span>Mechanical inspection</span><textarea data-path="inspection.mechanicalInspection">${esc(car.inspection.mechanicalInspection)}</textarea></label>
      ${input('Estimated repair budget', 'inspection.estimatedRepairBudget', car.inspection.estimatedRepairBudget, 'number', 'min="0" step=".01"')}
      <label class="field full"><span>Inspection photos</span><label class="file-upload">Take or choose photos<input type="file" accept="image/*" capture="environment" multiple data-upload="inspection"></label>${photoStrip(car.inspection.photos, 'inspection')}</label>
      </div>`;
  }
  function fileDisplay(file, kind) {
    if (!file) return '';
    const image = file.data.startsWith('data:image/');
    return image ? `<div class="thumb-wrap"><img class="thumb" src="${file.data}" data-view-file="${file.id}" data-file-kind="${kind}" alt="${esc(file.name)}"><button class="thumb-remove" data-remove-file="${file.id}" data-file-kind="${kind}">×</button></div>`
      : `<div class="doc"><button class="btn" data-view-file="${file.id}" data-file-kind="${kind}">Open ${esc(file.name)}</button><button class="btn danger" data-remove-file="${file.id}" data-file-kind="${kind}">Remove</button></div>`;
  }
  function documentsTab(car) {
    return `<p class="section-note">Keep title progress and supporting paperwork together. In local mode, files remain only in this browser.</p><div class="form-grid">
      ${select('Title status', 'documents.titleStatus', car.documents.titleStatus, ['Clean', 'Salvage', 'Rebuilt', 'Other'])}
      ${input('Title received date', 'documents.titleReceivedDate', car.documents.titleReceivedDate, 'date')}
      <label class="field full"><span>Document notes</span><textarea data-path="documents.notes">${esc(car.documents.notes)}</textarea></label>
      <label class="field"><span>Bill of sale</span><label class="file-upload">Upload bill of sale<input type="file" accept="image/*,.pdf" data-upload-document="Bill of sale"></label></label>
      <label class="field"><span>Auction invoice</span><label class="file-upload">Upload auction invoice<input type="file" accept="image/*,.pdf" data-upload-document="Auction invoice"></label></label>
      </div><div class="list">${car.documents.files.length ? car.documents.files.map(file => `<div class="item"><div><h4>${esc(file.type)}</h4><p>${esc(file.name)}</p></div><div class="item-actions"><button class="btn" data-view-file="${file.id}" data-file-kind="documents">Open</button><button class="btn danger" data-remove-file="${file.id}" data-file-kind="documents">Remove</button></div></div>`).join('') : '<div class="empty">No documents uploaded.</div>'}</div>`;
  }
  function partsTab(car) {
    return `<p class="section-note">Track ordering, delivery, returns, supplier, price, and receipt for each part.</p><form class="entry-form form-grid" data-add="part">
      ${input('Part name', 'form.partName', '')}${input('Part number', 'form.partNumber', '')}${input('Supplier', 'form.partSupplier', '')}${input('Price', 'form.partPrice', '', 'number', 'min="0" step=".01"')}${input('Order date', 'form.partOrderDate', '', 'date')}
      <label class="field"><span>Receipt</span><label class="file-upload">Add receipt<input id="partReceipt" type="file" accept="image/*,.pdf" capture="environment"></label></label>
      <button class="btn primary full" type="submit">+ Add part</button></form>
      <div class="list">${car.parts.length ? car.parts.map(part => `<article class="item"><div><h4>${esc(part.name)} ${part.partNumber ? '· ' + esc(part.partNumber) : ''}</h4><p>${esc(part.supplier || 'No supplier')} · Ordered ${esc(part.orderDate || 'not set')}</p><span class="badge ${part.deliveryStatus === 'Delivered' ? 'done' : ''}">${esc(part.deliveryStatus || 'Needed')}</span> <span class="badge">${esc(part.returnStatus || 'Not returned')}</span>${part.receipt ? `<p><button class="btn" data-view-inline-file="part" data-item-id="${part.id}">View receipt</button></p>` : ''}</div><div class="item-actions"><b>${money(part.price)}</b><button class="btn" data-edit-item="part" data-item-id="${part.id}">Update</button><button class="btn danger" data-remove-item="part" data-item-id="${part.id}">Remove</button></div></article>`).join('') : '<div class="empty">No parts added.</div>'}</div>${summaryRows(car)}`;
  }
  function repairsTab(car) {
    return `<p class="section-note">Track work needed, labor, shop, appointments, due dates, status, and receipts.</p><form class="entry-form form-grid" data-add="repair">
      ${input('Work needed', 'form.repairWork', '')}${input('Labor cost', 'form.repairCost', '', 'number', 'min="0" step=".01"')}${input('Shop / vendor', 'form.repairVendor', '')}${input('Appointment', 'form.repairAppointment', '', 'datetime-local')}${input('Due date', 'form.repairDueDate', '', 'date')}
      <label class="field"><span>Receipt</span><label class="file-upload">Add receipt<input id="repairReceipt" type="file" accept="image/*,.pdf" capture="environment"></label></label>
      <button class="btn primary full" type="submit">+ Add repair</button></form>
      <div class="list">${car.repairs.length ? car.repairs.map(repair => `<article class="item"><div><h4>${esc(repair.work)}</h4><p>${esc(repair.vendor || 'No vendor')} · Due ${esc(repair.dueDate || 'not set')}</p><span class="badge ${repair.status === 'Completed' ? 'done' : ''}">${esc(repair.status || 'Needed')}</span>${repair.receipt ? `<p><button class="btn" data-view-inline-file="repair" data-item-id="${repair.id}">View receipt</button></p>` : ''}</div><div class="item-actions"><b>${money(repair.laborCost)}</b><button class="btn" data-edit-item="repair" data-item-id="${repair.id}">Update</button><button class="btn danger" data-remove-item="repair" data-item-id="${repair.id}">Remove</button></div></article>`).join('') : '<div class="empty">No repair jobs added.</div>'}</div>${summaryRows(car)}`;
  }
  const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  function sortedTasks(tasks) {
    return [...tasks].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  }
  function taskHtml(task, showCar = false) {
    const overdue = task.dueDate && task.dueDate < today() && task.status !== 'Done';
    return `<article class="item ${overdue ? 'task-overdue' : ''}"><div><h4>${esc(task.title)}</h4><p>${showCar ? esc(task.carTitle) + ' · ' : ''}Assigned to: ${esc(task.assignee || 'Unassigned')} · Due ${esc(task.dueDate || 'not set')}</p><p>${esc(task.notes || '')}</p><span class="badge priority-${String(task.priority || 'Medium').toLowerCase()}">${esc(task.priority || 'Medium')}</span> <span class="badge ${task.status === 'Done' ? 'done' : ''}">${esc(task.status || 'To do')}</span>${overdue ? ' <span class="badge priority-critical">OVERDUE</span>' : ''}</div><div class="item-actions">${showCar ? `<button class="btn" data-open-task-car="${task.carId}">Open car</button>` : `<button class="btn" data-edit-item="task" data-item-id="${task.id}">Update</button><button class="btn danger" data-remove-item="task" data-item-id="${task.id}">Remove</button>`}</div></article>`;
  }
  function tasksTab(car) {
    return `<p class="section-note">Assign work by person and priority. Critical and high-priority work appears first.</p><form class="entry-form form-grid" data-add="task">
      ${input('Task', 'form.taskTitle', '')}${input('Assign to', 'form.taskAssignee', '')}${select('Priority', 'form.taskPriority', 'Medium', ['Critical', 'High', 'Medium', 'Low'])}${input('Due date', 'form.taskDueDate', '', 'date')}
      <label class="field"><span>Status</span><select data-form="taskStatus"><option>To do</option><option>In progress</option><option>Blocked</option><option>Done</option></select></label>
      <label class="field full"><span>Notes</span><textarea data-form="taskNotes"></textarea></label><button class="btn primary full" type="submit">+ Assign task</button></form>
      <div class="list">${car.teamTasks.length ? sortedTasks(car.teamTasks).map(task => taskHtml(task)).join('') : '<div class="empty">No team tasks assigned.</div>'}</div>`;
  }
  function holdingTab(car) {
    return `<p class="section-note">Record every cost incurred while owning the vehicle.</p><form class="entry-form form-grid" data-add="holding">
      ${select('Category', 'form.holdingCategory', 'Storage', ['Storage', 'Insurance', 'Fuel', 'Towing', 'Cleaning', 'Other'])}${input('Amount', 'form.holdingAmount', '', 'number', 'min="0" step=".01"')}${input('Date', 'form.holdingDate', '', 'date')}${input('Vendor / notes', 'form.holdingNotes', '')}
      <label class="field full"><span>Receipt</span><label class="file-upload">Add receipt<input id="holdingReceipt" type="file" accept="image/*,.pdf" capture="environment"></label></label><button class="btn primary full" type="submit">+ Add holding cost</button></form>
      <div class="list">${car.holdingCosts.length ? car.holdingCosts.map(item => `<article class="item"><div><h4>${esc(item.category)}</h4><p>${esc(item.date || 'No date')} · ${esc(item.notes || 'No notes')}</p>${item.receipt ? `<button class="btn" data-view-inline-file="holding" data-item-id="${item.id}">View receipt</button>` : ''}</div><div class="item-actions"><b>${money(item.amount)}</b><button class="btn danger" data-remove-item="holding" data-item-id="${item.id}">Remove</button></div></article>`).join('') : '<div class="empty">No holding costs added.</div>'}</div>${summaryRows(car)}`;
  }
  function listingTab(car) {
    return `<p class="section-note">Set pricing, save comparable vehicles and marketplace links, and keep listing photos.</p><div class="form-grid">
      ${input('Minimum acceptable price', 'listing.minimumPrice', car.listing.minimumPrice, 'number', 'min="0" step=".01"')}${input('Asking price', 'listing.askingPrice', car.listing.askingPrice, 'number', 'min="0" step=".01"')}${input('Listing date', 'listing.listingDate', car.listing.listingDate, 'date')}
      <label class="field full"><span>Marketplace links (one per line)</span><textarea data-path="listing.marketplaceLinks">${esc(car.listing.marketplaceLinks)}</textarea></label>
      <label class="field full"><span>Listing photos</span><label class="file-upload">Add listing photos<input type="file" accept="image/*" multiple data-upload="listing"></label>${photoStrip(car.listing.photos, 'listing')}</label></div>
      <form class="entry-form form-grid" data-add="comp">${input('Comparable source / URL', 'form.compSource', '')}${input('Comparable price', 'form.compPrice', '', 'number', 'min="0" step=".01"')}${input('Notes', 'form.compNotes', '')}<button class="btn primary" type="submit">+ Add comparable</button></form>
      <div class="list">${car.listing.comps.length ? car.listing.comps.map(comp => `<article class="item"><div><h4>${esc(comp.source || 'Comparable')}</h4><p>${esc(comp.notes || '')}</p></div><div class="item-actions"><b>${money(comp.price)}</b><button class="btn danger" data-remove-item="comp" data-item-id="${comp.id}">Remove</button></div></article>`).join('') : '<div class="empty">No comparable vehicles added.</div>'}</div>`;
  }
  function leadsTab(car) {
    return `<p class="section-note">Keep buyer conversations, appointments, test drives, offers, and follow-ups together.</p><form class="entry-form form-grid" data-add="lead">
      ${input('Buyer name', 'form.leadName', '')}${input('Contact information', 'form.leadContact', '')}${input('Appointment', 'form.leadAppointment', '', 'datetime-local')}${input('Offer', 'form.leadOffer', '', 'number', 'min="0" step=".01"')}
      <label class="field"><span>Test drive</span><select data-form="leadTestDrive"><option>Not scheduled</option><option>Scheduled</option><option>Completed</option></select></label>
      <label class="field"><span>Status</span><select data-form="leadStatus"><option>New</option><option>Contacted</option><option>Negotiating</option><option>Accepted</option><option>Declined</option></select></label>
      <label class="field full"><span>Follow-up notes</span><textarea data-form="leadNotes"></textarea></label><button class="btn primary full" type="submit">+ Add lead</button></form>
      <div class="list">${car.leads.length ? car.leads.map(lead => `<article class="item"><div><h4>${esc(lead.name)}</h4><p>${esc(lead.contact)} · ${esc(lead.appointment || 'No appointment')}</p><p>Test drive: ${esc(lead.testDrive)} · ${esc(lead.notes || '')}</p><span class="badge ${lead.status === 'Accepted' ? 'done' : ''}">${esc(lead.status)}</span></div><div class="item-actions"><b>${money(lead.offer)}</b><button class="btn" data-edit-item="lead" data-item-id="${lead.id}">Update</button><button class="btn danger" data-remove-item="lead" data-item-id="${lead.id}">Remove</button></div></article>`).join('') : '<div class="empty">No buyer leads added.</div>'}</div>`;
  }
  function saleTab(car) {
    const c = costs(car);
    return `<p class="section-note">Complete the transaction and confirm payment, bill of sale, and title transfer.</p><div class="form-grid">
      ${input('Sale price', 'sale.salePrice', car.sale.salePrice, 'number', 'min="0" step=".01"')}${input('Sale date', 'sale.saleDate', car.sale.saleDate, 'date')}${select('Payment status', 'sale.paymentStatus', car.sale.paymentStatus, ['Not paid', 'Deposit received', 'Paid in full', 'Refunded'])}
      ${input('Selling fees', 'sale.sellingFees', car.sale.sellingFees, 'number', 'min="0" step=".01"')}${select('Title-transfer status', 'sale.titleTransferStatus', car.sale.titleTransferStatus, ['Not started', 'Documents signed', 'Submitted', 'Completed'])}
      <label class="field"><span>Final bill of sale</span><label class="file-upload">Upload bill of sale<input type="file" accept="image/*,.pdf" data-upload-sale></label>${fileDisplay(car.sale.billOfSale, 'sale')}</label>
      </div><div class="money-grid"><div class="money-box"><strong>${money(c.allIn)}</strong><span>All-in cost</span></div><div class="money-box"><strong>${money(car.sale.salePrice)}</strong><span>Sale price</span></div><div class="money-box"><strong class="${c.profit >= 0 ? 'profit' : 'error'}">${money(c.profit)}</strong><span>Net profit</span></div><div class="money-box"><strong>${c.roi.toFixed(1)}%</strong><span>ROI</span></div></div><div class="modal-foot"><button class="btn primary" data-mark-sold>Save & mark sold</button></div>`;
  }

  function setPath(object, path, value) {
    const keys = path.split('.'); let target = object;
    keys.slice(0, -1).forEach(key => target = target[key]);
    target[keys.at(-1)] = value;
  }
  function getFormValue(root, name) {
    return root.querySelector(`[data-path="form.${name}"],[data-form="${name}"]`)?.value.trim() || '';
  }
  async function fileToData(file) {
    if (!file) return null;
    if (file.type.startsWith('image/')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const image = new Image();
          image.onerror = reject;
          image.onload = () => {
            const max = 1400, scale = Math.min(1, max / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve({ id: uid(), name: file.name, data: canvas.toDataURL('image/jpeg', .72) });
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    if (file.size > 1500000) throw new Error('PDF must be smaller than 1.5 MB in local mode.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = reject;
      reader.onload = () => resolve({ id: uid(), name: file.name, data: reader.result }); reader.readAsDataURL(file);
    });
  }
  function openData(data) {
    const win = window.open();
    if (win) win.location.href = data;
  }
  function locateFile(car, kind, id) {
    if (kind === 'inspection') return car.inspection.photos.find(file => file.id === id);
    if (kind === 'listing') return car.listing.photos.find(file => file.id === id);
    if (kind === 'documents') return car.documents.files.find(file => file.id === id);
    if (kind === 'sale') return car.sale.billOfSale?.id === id ? car.sale.billOfSale : null;
  }
  function removeFile(car, kind, id) {
    if (kind === 'inspection') car.inspection.photos = car.inspection.photos.filter(file => file.id !== id);
    if (kind === 'listing') car.listing.photos = car.listing.photos.filter(file => file.id !== id);
    if (kind === 'documents') car.documents.files = car.documents.files.filter(file => file.id !== id);
    if (kind === 'sale') car.sale.billOfSale = null;
  }

  $('detailContent').addEventListener('click', async event => {
    const car = selectedCar();
    if (event.target.closest('[data-detail-close]')) return $('detailDialog').close();
    const tab = event.target.closest('[data-tab]');
    if (tab) { activeTab = tab.dataset.tab; renderDetail(); return; }
    const stage = event.target.closest('[data-stage]');
    if (stage) { car.stage = stage.dataset.stage; saveCars(true); return; }
    const remove = event.target.closest('[data-remove-item]');
    if (remove) {
      const maps = { part: 'parts', repair: 'repairs', task: 'teamTasks', holding: 'holdingCosts', comp: 'listing.comps', lead: 'leads' };
      const key = maps[remove.dataset.removeItem];
      if (key.includes('.')) car.listing.comps = car.listing.comps.filter(item => item.id !== remove.dataset.itemId);
      else car[key] = car[key].filter(item => item.id !== remove.dataset.itemId);
      saveCars(true); return;
    }
    const edit = event.target.closest('[data-edit-item]');
    if (edit) { editRecord(car, edit.dataset.editItem, edit.dataset.itemId); return; }
    const inlineFile = event.target.closest('[data-view-inline-file]');
    if (inlineFile) {
      const map = { part: car.parts, repair: car.repairs, holding: car.holdingCosts };
      const item = map[inlineFile.dataset.viewInlineFile].find(record => record.id === inlineFile.dataset.itemId);
      if (item?.receipt?.data) openData(item.receipt.data); return;
    }
    const view = event.target.closest('[data-view-file]');
    if (view) { const file = locateFile(car, view.dataset.fileKind, view.dataset.viewFile); if (file) openData(file.data); return; }
    const removeFileButton = event.target.closest('[data-remove-file]');
    if (removeFileButton) { removeFile(car, removeFileButton.dataset.fileKind, removeFileButton.dataset.removeFile); saveCars(true); return; }
    if (event.target.closest('[data-mark-sold]')) {
      car.stage = 'sold'; if (!car.sale.saleDate) car.sale.saleDate = today(); saveCars(true); return;
    }
  });
  $('detailContent').addEventListener('change', async event => {
    const car = selectedCar();
    if (event.target.matches('[data-path]') && !event.target.dataset.path.startsWith('form.')) {
      setPath(car, event.target.dataset.path, event.target.value);
      if (event.target.dataset.path === 'purchase.sourceType' && isNonAuctionSource(event.target.value)) car.purchase.auctionFees = '';
      saveCars(event.target.dataset.path === 'purchase.sourceType'); return;
    }
    if (event.target.matches('[data-upload]')) {
      try {
        const files = await Promise.all([...event.target.files].map(fileToData));
        if (event.target.dataset.upload === 'inspection') car.inspection.photos.push(...files);
        else car.listing.photos.push(...files);
        saveCars(true);
      } catch (error) { alert(error.message || 'File could not be processed.'); }
      return;
    }
    if (event.target.matches('[data-upload-document]')) {
      try { const file = await fileToData(event.target.files[0]); if (file) { file.type = event.target.dataset.uploadDocument; car.documents.files.push(file); saveCars(true); } }
      catch (error) { alert(error.message || 'Document could not be processed.'); }
      return;
    }
    if (event.target.matches('[data-upload-sale]')) {
      try { car.sale.billOfSale = await fileToData(event.target.files[0]); saveCars(true); }
      catch (error) { alert(error.message || 'Document could not be processed.'); }
    }
  });
  $('detailContent').addEventListener('submit', async event => {
    const form = event.target.closest('[data-add]');
    if (!form) return;
    event.preventDefault();
    const car = selectedCar(), type = form.dataset.add, button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = 'Saving…';
    try {
      if (type === 'part') {
        const name = getFormValue(form, 'partName'); if (!name) throw new Error('Enter the part name.');
        car.parts.push({ id: uid(), name, partNumber: getFormValue(form, 'partNumber'), supplier: getFormValue(form, 'partSupplier'), price: getFormValue(form, 'partPrice'), orderDate: getFormValue(form, 'partOrderDate'), deliveryStatus: 'Ordered', returnStatus: 'Not returned', receipt: await fileToData($('partReceipt').files[0]) });
      } else if (type === 'repair') {
        const work = getFormValue(form, 'repairWork'); if (!work) throw new Error('Enter the work needed.');
        car.repairs.push({ id: uid(), work, laborCost: getFormValue(form, 'repairCost'), vendor: getFormValue(form, 'repairVendor'), appointment: getFormValue(form, 'repairAppointment'), dueDate: getFormValue(form, 'repairDueDate'), status: 'Needed', receipt: await fileToData($('repairReceipt').files[0]) });
      } else if (type === 'task') {
        const title = getFormValue(form, 'taskTitle'); if (!title) throw new Error('Enter the task.');
        car.teamTasks.push({ id: uid(), title, assignee: getFormValue(form, 'taskAssignee'), priority: getFormValue(form, 'taskPriority'), dueDate: getFormValue(form, 'taskDueDate'), status: getFormValue(form, 'taskStatus'), notes: getFormValue(form, 'taskNotes') });
      } else if (type === 'holding') {
        car.holdingCosts.push({ id: uid(), category: getFormValue(form, 'holdingCategory'), amount: getFormValue(form, 'holdingAmount'), date: getFormValue(form, 'holdingDate'), notes: getFormValue(form, 'holdingNotes'), receipt: await fileToData($('holdingReceipt').files[0]) });
      } else if (type === 'comp') {
        car.listing.comps.push({ id: uid(), source: getFormValue(form, 'compSource'), price: getFormValue(form, 'compPrice'), notes: getFormValue(form, 'compNotes') });
      } else if (type === 'lead') {
        const name = getFormValue(form, 'leadName'); if (!name) throw new Error('Enter the buyer name.');
        car.leads.push({ id: uid(), name, contact: getFormValue(form, 'leadContact'), appointment: getFormValue(form, 'leadAppointment'), offer: getFormValue(form, 'leadOffer'), testDrive: getFormValue(form, 'leadTestDrive'), status: getFormValue(form, 'leadStatus'), notes: getFormValue(form, 'leadNotes') });
      }
      saveCars(true);
    } catch (error) { alert(error.message || 'Record could not be saved.'); button.disabled = false; }
  });
  function editRecord(car, type, id) {
    if (type === 'part') {
      const item = car.parts.find(record => record.id === id);
      item.deliveryStatus = prompt('Delivery status: Needed, Ordered, Shipped, or Delivered', item.deliveryStatus) || item.deliveryStatus;
      item.returnStatus = prompt('Return status: Not returned, Return needed, Returned, or Refunded', item.returnStatus) || item.returnStatus;
      const price = prompt('Price paid', item.price); if (price !== null) item.price = price;
    } else if (type === 'repair') {
      const item = car.repairs.find(record => record.id === id);
      item.status = prompt('Status: Needed, Scheduled, In progress, or Completed', item.status) || item.status;
      const cost = prompt('Labor cost', item.laborCost); if (cost !== null) item.laborCost = cost;
    } else if (type === 'task') {
      const item = car.teamTasks.find(record => record.id === id);
      item.status = prompt('Status: To do, In progress, Blocked, or Done', item.status) || item.status;
      item.priority = prompt('Priority: Critical, High, Medium, or Low', item.priority) || item.priority;
      item.assignee = prompt('Assigned team member', item.assignee) ?? item.assignee;
      item.notes = prompt('Task notes', item.notes) ?? item.notes;
    } else if (type === 'lead') {
      const item = car.leads.find(record => record.id === id);
      item.status = prompt('Status: New, Contacted, Negotiating, Accepted, or Declined', item.status) || item.status;
      const offer = prompt('Current offer', item.offer); if (offer !== null) item.offer = offer;
      item.notes = prompt('Follow-up notes', item.notes) ?? item.notes;
    }
    saveCars(true);
  }

  $('tasksBtn').onclick = () => { renderGlobalTasks(); $('tasksDialog').showModal(); };
  function renderGlobalTasks() {
    const allTasks = cars.flatMap(car => car.teamTasks.map(task => ({ ...task, carId: car.id, carTitle: carTitle(car) })));
    const openTasks = sortedTasks(allTasks.filter(task => task.status !== 'Done'));
    const doneTasks = sortedTasks(allTasks.filter(task => task.status === 'Done'));
    $('tasksContent').innerHTML = `<header class="modal-head"><div><h2>Team task list</h2><p>All assigned work sorted by priority and due date.</p></div><button class="icon-btn" data-tasks-close>×</button></header>
      <div class="money-grid"><div class="money-box"><strong>${openTasks.length}</strong><span>Open tasks</span></div><div class="money-box"><strong>${openTasks.filter(task => task.priority === 'Critical').length}</strong><span>Critical</span></div><div class="money-box"><strong>${openTasks.filter(task => task.dueDate && task.dueDate < today()).length}</strong><span>Overdue</span></div><div class="money-box"><strong>${doneTasks.length}</strong><span>Completed</span></div></div>
      <h3>Priority queue</h3><div class="list">${openTasks.length ? openTasks.map(task => taskHtml(task, true)).join('') : '<div class="empty">No open team tasks.</div>'}</div>
      <h3>Completed</h3><div class="list">${doneTasks.length ? doneTasks.map(task => taskHtml(task, true)).join('') : '<div class="empty">No completed tasks yet.</div>'}</div>`;
  }
  $('tasksContent').onclick = event => {
    if (event.target.closest('[data-tasks-close]')) return $('tasksDialog').close();
    const open = event.target.closest('[data-open-task-car]');
    if (open) { $('tasksDialog').close(); openCar(open.dataset.openTaskCar); activeTab = 'tasks'; renderDetail(); }
  };
  $('reportsBtn').onclick = () => { renderReports(); $('reportsDialog').showModal(); };
  function renderReports() {
    const sold = cars.filter(car => car.stage === 'sold');
    const inventoryValue = cars.filter(car => car.stage !== 'sold').reduce((sum, car) => sum + costs(car).allIn, 0);
    const revenue = sold.reduce((sum, car) => sum + num(car.sale.salePrice), 0);
    const net = sold.reduce((sum, car) => sum + costs(car).profit, 0);
    const monthly = {};
    sold.forEach(car => { const month = car.sale.saleDate?.slice(0, 7) || 'No date'; monthly[month] = (monthly[month] || 0) + costs(car).profit; });
    $('reportsContent').innerHTML = `<header class="modal-head"><div><h2>Business reporting</h2><p>Current inventory and realized sales performance.</p></div><button class="icon-btn" data-reports-close>×</button></header>
      <div class="report-actions"><button class="btn primary" data-export-csv>Export CSV</button><button class="btn" data-print-report>Print / Save PDF</button></div>
      <div class="money-grid"><div class="money-box"><strong>${money(inventoryValue)}</strong><span>Active inventory cost</span></div><div class="money-box"><strong>${money(revenue)}</strong><span>Sales revenue</span></div><div class="money-box"><strong class="${net >= 0 ? 'profit' : 'error'}">${money(net)}</strong><span>Realized net profit</span></div><div class="money-box"><strong>${sold.length}</strong><span>Vehicles sold</span></div></div>
      <h3>Vehicle report</h3><div style="overflow:auto"><table class="report-table"><thead><tr><th>Vehicle</th><th>Status</th><th>Purchase</th><th>Parts</th><th>Repairs</th><th>Holding</th><th>All-in</th><th>Sale</th><th>Profit</th><th>ROI</th><th>Days</th></tr></thead><tbody>${cars.map(car => { const c = costs(car); return `<tr><td>${esc(carTitle(car))}</td><td>${STAGE_LABELS[car.stage]}</td><td>${money(c.acquisition)}</td><td>${money(c.parts)}</td><td>${money(c.repairs)}</td><td>${money(c.holding)}</td><td>${money(c.allIn)}</td><td>${money(car.sale.salePrice)}</td><td>${money(c.profit)}</td><td>${c.roi.toFixed(1)}%</td><td>${daysHeld(car)}</td></tr>`; }).join('')}</tbody></table></div>
      <h3>Monthly realized profit</h3><div class="summary">${Object.keys(monthly).length ? Object.entries(monthly).sort().map(([month, value]) => `<div class="line"><span>${month}</span><b>${money(value)}</b></div>`).join('') : '<div class="empty">No completed sales yet.</div>'}</div>`;
  }
  $('reportsContent').onclick = event => {
    if (event.target.closest('[data-reports-close]')) $('reportsDialog').close();
    if (event.target.closest('[data-print-report]')) window.print();
    if (event.target.closest('[data-export-csv]')) exportCsv();
  };
  function exportCsv() {
    const headers = ['VIN', 'Year', 'Make', 'Model', 'Trim', 'Stage', 'Purchase Source', 'Seller/Auction', 'Purchase Date', 'Purchase Price', 'Auction Fees', 'Taxes', 'Transportation', 'Parts', 'Repairs', 'Holding', 'Selling Fees', 'All-in Cost', 'Sale Price', 'Sale Date', 'Net Profit', 'ROI %', 'Days Held'];
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = cars.map(car => {
      const c = costs(car);
      return [car.vin, car.year, car.make, car.model, car.trim, STAGE_LABELS[car.stage], car.purchase.sourceType, car.purchase.seller, car.purchase.purchaseDate, car.purchase.purchasePrice, car.purchase.auctionFees, car.purchase.taxes, car.purchase.transportation, c.parts, c.repairs, c.holding, c.selling, c.allIn, car.sale.salePrice, car.sale.saleDate, c.profit, c.roi.toFixed(1), daysHeld(car)];
    });
    const csv = [headers, ...rows].map(row => row.map(quote).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'flip-tracker-report-' + today() + '.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  $('detailDialog').onclick = event => { if (event.target === $('detailDialog')) $('detailDialog').close(); };
  $('intakeDialog').onclick = event => { if (event.target === $('intakeDialog')) $('intakeDialog').close(); };
  $('tasksDialog').onclick = event => { if (event.target === $('tasksDialog')) $('tasksDialog').close(); };
  $('reportsDialog').onclick = event => { if (event.target === $('reportsDialog')) $('reportsDialog').close(); };
  saveCars();
})();
