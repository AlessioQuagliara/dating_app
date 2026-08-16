(function () {
  const modal = document.getElementById('event_view_modal');
  const list = document.getElementById('events-list');
  if (!modal || !list) return;

  const viewIcon = document.getElementById('view-icon');
  const viewActivity = document.getElementById('view-activity');
  const viewDate = document.getElementById('view-date');
  const viewBadge = document.getElementById('view-status-badge');
  const icsLink = document.getElementById('view-ics-link');
  const deleteBtn = document.getElementById('view-delete-btn');

  let currentId = null;

  function apriEvento(row) {
    currentId = row.dataset.id;
    viewIcon.className = row.dataset.icon + ' text-6xl text-pink-500';
    viewActivity.textContent = row.dataset.activity;
    viewDate.textContent = row.dataset.date;
    viewBadge.innerHTML =
      row.dataset.past === 'true'
        ? '<span class="badge badge-success gap-1"><i class="ri-checkbox-circle-fill"></i> Fatto</span>'
        : '<span class="badge badge-primary gap-1"><i class="ri-time-line"></i> In programma</span>';
    icsLink.href = `/api/eventi/${currentId}/ics`;
    modal.showModal();
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.event-row');
    if (row) apriEvento(row);
  });

  deleteBtn.addEventListener('click', async () => {
    if (!currentId) return;
    if (!confirm('Eliminare questo appuntamento?')) return;

    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/eventi/${currentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');

      const row = list.querySelector(`.event-row[data-id="${currentId}"]`);
      if (row) row.remove();
      if (!list.querySelector('.event-row')) {
        list.classList.add('hidden');
        const empty = document.getElementById('events-empty');
        if (empty) empty.classList.remove('hidden');
      }

      modal.close();
    } catch (err) {
      alert("Errore durante l'eliminazione, riprova.");
    } finally {
      deleteBtn.disabled = false;
    }
  });
})();
