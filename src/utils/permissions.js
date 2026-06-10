const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const canManageEvent = (user, event) => {
  if (!user || !event) return false;
  if (user.role === "admin") return true;
  return user.role === "organizer" && getId(event.organizer) === getId(user);
};

module.exports = {
  canManageEvent,
  getId
};
