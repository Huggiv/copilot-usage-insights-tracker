import { useMemo, useState } from 'react';

export default function FilterBar({
  users,
  models,
  selectedUsers,
  selectedModel,
  selectedDays,
  onUsersChange,
  onModelChange,
  onDaysChange,
}) {
  const [userSearch, setUserSearch] = useState('');
  const userOptions = users.map((u) => u.user_id).filter(Boolean);
  const modelOptions = models.map((m) => m.model).filter(Boolean);
  const selectedUserSet = new Set(selectedUsers || []);
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return userOptions;
    }
    return userOptions.filter((user) => user.toLowerCase().includes(query));
  }, [userOptions, userSearch]);

  const userFilterLabel = selectedUserSet.size === 0
    ? 'All users'
    : `${selectedUserSet.size} user${selectedUserSet.size === 1 ? '' : 's'} selected`;

  function toggleUser(user) {
    const next = new Set(selectedUserSet);
    if (next.has(user)) {
      next.delete(user);
    } else {
      next.add(user);
    }
    onUsersChange([...next].sort());
  }

  return (
    <div className="filter-bar">
      <div className="filter-item">
        <label htmlFor="userFilterSearch">User</label>
        <details className="multi-filter">
          <summary>{userFilterLabel}</summary>
          <div className="multi-filter-panel">
            <input
              id="userFilterSearch"
              type="search"
              className="filter-search"
              placeholder="Search users"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <div className="filter-actions">
              <button type="button" onClick={() => onUsersChange(userOptions)}>Select all</button>
              <button type="button" onClick={() => onUsersChange([])}>Clear</button>
            </div>
            <div className="checkbox-list">
              {visibleUsers.length === 0 ? (
                <p className="filter-empty">No users found</p>
              ) : (
                visibleUsers.map((user) => (
                  <label className="checkbox-row" key={user}>
                    <input
                      type="checkbox"
                      checked={selectedUserSet.has(user)}
                      onChange={() => toggleUser(user)}
                    />
                    <span>{user}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </details>
      </div>

      <div className="filter-item">
        <label htmlFor="modelFilter">Model</label>
        <select
          id="modelFilter"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          <option value="">All models</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-item">
        <label htmlFor="daysFilter">Period</label>
        <select
          id="daysFilter"
          value={selectedDays}
          onChange={(e) => onDaysChange(e.target.value)}
        >
          <option value="current_month">Current month</option>
          <option value="1">Current day</option>
          <option value="7">Last 7 days</option>
          <option value="all_time">All time</option>
        </select>
      </div>
    </div>
  );
}
