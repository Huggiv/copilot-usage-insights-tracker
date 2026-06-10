export default function FilterBar({
  users,
  models,
  selectedUser,
  selectedModel,
  selectedDays,
  onUserChange,
  onModelChange,
  onDaysChange,
}) {
  const userOptions = users.map((u) => u.user_id).filter(Boolean);
  const modelOptions = models.map((m) => m.model).filter(Boolean);

  return (
    <div className="filter-bar">
      <div className="filter-item">
        <label htmlFor="userFilter">User</label>
        <select
          id="userFilter"
          value={selectedUser}
          onChange={(e) => onUserChange(e.target.value)}
        >
          <option value="">All users</option>
          {userOptions.map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </select>
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
          <option value="30">Last 30 days</option>
          <option value="365">All time</option>
        </select>
      </div>
    </div>
  );
}
