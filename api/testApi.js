const axios = require('axios');
const API = 'http://10.10.0.13:3000/api';

function now() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

async function safeDelete(url, params = {}) {
  try {
    const res = await axios.delete(url, { params });
    console.log(`DELETE ${url} ${JSON.stringify(params)} → ${res.status}`);
  } catch (err) {
    if (!(err.response && err.response.status === 404)) {
      console.warn(`DELETE ${url} error:`, err.response?.data || err.message);
    }
  }
}

async function fullCleanup() {
  console.log('--- Full Cleanup ---');

  // 1. RAWREG (must go first to avoid foreign key conflicts)
  const rawregItems = await axios.get(`${API}/rawreg`).then(res => res.data).catch(() => []);
  for (const item of rawregItems) {
    const id = item.id;
    if (id != null) {
      await safeDelete(`${API}/rawreg/${id}`);
    }
  }

  // 2. Other tables
  const endpoints = ['batreg', 'recreg', 'artreg', 'levreg', 'anvreg'];

  for (const type of endpoints) {
    const url = `${API}/${type}`;
    const items = await axios.get(url).then(res => res.data).catch(() => []);

    for (const item of items) {
      let id;

      if (type === 'batreg') {
        id = item.id;
      } else if (type === 'recreg') {
        id = `${item.ARARTN}/${item.RRSEQN}`;
      } else if (type === 'artreg') {
        id = item.ARARTN;
      } else if (type === 'levreg') {
        id = item.LRLEVN;
      } else if (type === 'anvreg') {
        id = item.ANANVN;
      }

      if (id != null && id !== 'NaN') {
        await safeDelete(`${url}/${id}`);
      }
    }
  }

  console.log('--- Cleanup Complete ---');
}

async function run() {
  await fullCleanup(); // Clean up before test run

  const tryPost = async (label, url, body) => {
    try {
      const res = await axios.post(url, body);
      console.log(`POST   ${label} →`, res.data);
      return res;
    } catch (err) {
      console.error(`❌ ${label} error:`, err.response?.data || err.message);
    }
  };

  const tryGet = async (label, url) => {
    try {
      const res = await axios.get(url);
      console.log(`GET    ${label} →`, res.data);
      return res;
    } catch (err) {
      console.error(`❌ ${label} error:`, err.response?.data || err.message);
    }
  };

  const tryPut = async (label, url, body) => {
    try {
      const res = await axios.put(url, body);
      console.log(`PUT    ${label} →`, res.data);
      return res;
    } catch (err) {
      console.error(`❌ ${label} error:`, err.response?.data || err.message);
    }
  };

  const tryDelete = async (label, url) => {
    try {
      const res = await axios.delete(url);
      console.log(`DELETE ${label} →`, res.status);
    } catch (err) {
      console.error(`❌ ${label} error:`, err.response?.data || err.message);
    }
  };

  const dates = {
    now: now(),
    future: '2025-12-31 00:00:00'
  };

  console.log('\n–– TESTING LEVREG ––');
  await tryPost('/levreg', `${API}/levreg`, {
    LRLEVN: 'LEV001',
    LRNAMN: 'Åre Import AB',
    LRKONT: '070-1234567',
    LRSTAT: 1
  });
  await tryGet('/levreg', `${API}/levreg`);
  await tryGet('/levreg/LEV001', `${API}/levreg/LEV001`);
  await tryPut('/levreg/LEV001', `${API}/levreg/LEV001`, {
    LRLEVN: 'LEV001',
    LRNAMN: 'Österåkers Grossist AB',
    LRKONT: '08-7654321',
    LRSTAT: 2
  });

  console.log('\n–– TESTING ARTREG ––');
  await tryPost('/artreg', `${API}/artreg`, {
    ARARTN: 'ART100',
    ARARTS: 'SELL100',
    ARNAMN: 'Produkt Å100',
    ARLEVE: 'LEV001',
    ARSTATNR: 1,
    ARTYPNR: 'F',
    ARLMDT: dates.now,
    ARRGDT: dates.now
  });
  await tryPost('/artreg', `${API}/artreg`, {
    ARARTN: 'RAW001',
    ARARTS: 'RAW001',
    ARNAMN: 'Råvara Salt',
    ARLEVE: 'LEV001',
    ARSTATNR: 1,
    ARTYPNR: 'R',
    ARLMDT: dates.now,
    ARRGDT: dates.now
  });
  await tryGet('/artreg', `${API}/artreg`);
  await tryGet('/artreg/ART100', `${API}/artreg/ART100`);
  await tryPut('/artreg/ART100', `${API}/artreg/ART100`, {
    ARARTN: 'ART100',
    ARARTS: 'SELL100',
    ARNAMN: 'Ny Produkt Ä200',
    ARLEVE: 'LEV001',
    ARSTATNR: 2,
    ARTYPNR: 'F',
    ARLMDT: dates.now,
    ARRGDT: dates.now
  });

  console.log('\n–– TESTING RECREG ––');
  await tryPost('/recreg', `${API}/recreg`, {
    ARARTN: 'ART100',
    RRARTS: 'SELL100',
    RRSEQN: 1,
    RRINAR: 2.5,
    RRRGDT: dates.now,
    RRLMDT: dates.now
  });
  await tryGet('/recreg', `${API}/recreg`);
  await tryGet('/recreg/ART100', `${API}/recreg/ART100`);
  await tryPut('/recreg/ART100/1', `${API}/recreg/ART100/1`, {
    ARARTN: 'ART100',
    RRARTS: 'SELL100',
    RRSEQN: 1,
    RRINAR: 3.0,
    RRRGDT: dates.now,
    RRLMDT: dates.now
  });

  console.log('\n–– TESTING BATREG ––');
  const batregRes = await tryPost('/batreg', `${API}/batreg`, {
    BRARTN: 'BATCH100',
    BRARTS: 'ART100',
    BRBBDT: dates.future,
    BRTRVI: 0.0,
    BRVIKT: 100.0,
    BRKVANT: 100,
    BRAPI1: null,
    BRAPI2: null
  });

  const batchId = batregRes?.data?.id;

  await tryGet('/batreg', `${API}/batreg`);
  if (batchId) {
    await tryGet(`/batreg/${batchId}`, `${API}/batreg/${batchId}`);
    await tryPut(`/batreg/${batchId}`, `${API}/batreg/${batchId}`, {
      BRARTS: 'ART100',
      BRVIKT: 110.0,
      BRTRVI: 0.1,
      BRKVANT: 120,
      BRBBDT: dates.future
    });
  }

  console.log('\n–– TESTING ANVREG ––');
  await tryPost('/anvreg', `${API}/anvreg`, {
    ANANVN: 42,
    ANMAIL: 'jens@example.com',
    ANPASS: 'losenord123'
  });
  await tryGet('/anvreg', `${API}/anvreg`);
  await tryGet('/anvreg/42', `${API}/anvreg/42`);
  await tryPut('/anvreg/42', `${API}/anvreg/42`, {
    ANANVN: 42,
    ANMAIL: 'jens.frost@example.com',
    ANPASS: 'losenord123'
  });

  console.log('\n–– TESTING RAWREG ––');
  await tryPost('/rawreg', `${API}/rawreg`, {
    material: 'RAW001',
    date: now(),
    weight: 50.0,
    supplier: 'LEV001',
    notes: 'Första leverans'
  });
  await tryPost('/rawreg', `${API}/rawreg`, {
    material: 'RAW001',
    date: now(),
    weight: 30.0,
    supplier: 'LEV001',
    notes: 'Andra leverans'
  });
  await tryGet('/rawreg', `${API}/rawreg`);

  console.log('\n✅ All tests done. Now cleaning up...');
  await fullCleanup(); // Clean up after test run
}

run();
