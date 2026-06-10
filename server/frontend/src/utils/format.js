/**
 * Utility functions for formatting various data types
 */

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

export function formatTokenCompact(value) {
  const tokenValue = Number(value ?? 0);
  if (tokenValue >= 1_000_000) {
    const scaled = (tokenValue / 1_000_000).toFixed(1);
    return `${scaled.endsWith('.0') ? scaled.slice(0, -2) : scaled}M`;
  }
  if (tokenValue >= 1_000) {
    const scaled = (tokenValue / 1_000).toFixed(1);
    return `${scaled.endsWith('.0') ? scaled.slice(0, -2) : scaled}K`;
  }
  return formatNumber(tokenValue);
}

export function formatDurationMs(ms) {
  const totalMs = ms || 0;
  const totalSeconds = Math.floor(totalMs / 1000);
  
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const mins = totalMinutes;
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const hours = totalHours;
    const mins = totalMinutes % 60;
    const secs = totalSeconds % 60;
    return `${hours}h ${mins}m ${secs}s`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMinutes % 60;
  
  if (days < 30) {
    return `${days}d ${hours}h ${mins}m`;
  }

  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  
  if (months < 12) {
    return `${months}mo ${remainingDays}d`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years}y ${remainingMonths}mo`;
}

export function formatDate(value) {
  if (!value) {
    return '-';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString();
}

export function formatCredits(nano_aiu) {
  return ((nano_aiu || 0) / 1e9).toFixed(4);
}

export function formatCost(nano_aiu) {
  return `$${((nano_aiu || 0) / 1e11).toFixed(4)}`;
}
