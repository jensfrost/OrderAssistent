// routes/_parseDate.js

/**
 * Parse a date string in any of:
 *  • "YYYY-MM-DDTHH:mm:ss"
 *  • "YYYY-MM-DD HH:mm:ss"
 *  • "YYYY-MM-DD"
 * into a local JS Date.
 */
function parseToLocalDate(value) {
    if (typeof value !== 'string') return null;

    // Case 1: full datetime with T
    if (value.includes('T')) {
      const [datePart, timePart] = value.split('T');
      return _buildDate(datePart, timePart);
    }

    // Case 2: datetime with space
    if (value.includes(' ')) {
      const [datePart, timePart] = value.split(' ');
      return _buildDate(datePart, timePart);
    }

    // Case 3: pure date "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // interpret as midnight local time
      return _buildDate(value, '00:00:00');
    }

    // unrecognized
    return null;
  }

  function _buildDate(datePart, timePart) {
    const [yyyy, MM, dd] = datePart.split('-').map(Number);
    const [hh, mm2, ss] = timePart.split(':').map(Number);
    return new Date(yyyy, MM - 1, dd, hh, mm2, ss);
  }

  module.exports = parseToLocalDate;
