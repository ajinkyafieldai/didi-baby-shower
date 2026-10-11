export function visibleCallPeople(participants) {
  return Object.values(participants).filter(person => person.permissions?.hasPresence !== false &&
    person.user_id !== 'daily-photobooth' && person.user_name !== 'Family Photobooth');
}
