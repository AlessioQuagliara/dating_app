(function () {
  const modal = document.getElementById('my_modal_2');
  if (!modal) return;

  const stepPanels = modal.querySelectorAll('[data-step]');
  const stepIndicators = modal.querySelectorAll('[data-step-indicator]');
  const btnBack = document.getElementById('wizard-back');
  const btnNext = document.getElementById('wizard-next');
  const btnConfirm = document.getElementById('wizard-confirm');
  const checkboxes = modal.querySelectorAll('.activity-checkbox');
  const variantGroups = modal.querySelectorAll('.wizard-variant-group');
  const variantButtons = modal.querySelectorAll('.variant-btn');
  const calendar = document.getElementById('wizard-calendar');
  const summary = document.getElementById('wizard-summary');
  const successBox = document.getElementById('wizard-success');
  const icsLink = document.getElementById('wizard-ics-link');
  const toast = document.getElementById('wizard-toast');

  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  const INDICATOR_FOR_PHASE = { activity: 1, variant: 1, calendar: 2, confirm: 3 };

  let currentPhase = 'activity';
  let selected = { slug: null, name: null, icon: null, variant: null };
  let selectedDate = null;

  function formatDateIt(iso) {
    const [y, m, d] = iso.split('-');
    return `${parseInt(d, 10)} ${MESI[parseInt(m, 10) - 1]} ${y}`;
  }

  function activityHasVariant(slug) {
    return !!modal.querySelector(`.wizard-variant-group[data-variant-for="${slug}"]`);
  }

  function nextPhase(phase) {
    if (phase === 'activity') return activityHasVariant(selected.slug) ? 'variant' : 'calendar';
    if (phase === 'variant') return 'calendar';
    if (phase === 'calendar') return 'confirm';
    return 'confirm';
  }

  function prevPhase(phase) {
    if (phase === 'confirm') return 'calendar';
    if (phase === 'calendar') return activityHasVariant(selected.slug) ? 'variant' : 'activity';
    return 'activity';
  }

  function updateNextState() {
    if (currentPhase === 'activity') btnNext.disabled = !selected.name;
    else if (currentPhase === 'variant') btnNext.disabled = !selected.variant;
    else if (currentPhase === 'calendar') btnNext.disabled = !selectedDate;
  }

  function showStep(phase) {
    currentPhase = phase;

    stepPanels.forEach((el) => el.classList.toggle('hidden', el.dataset.step !== phase));

    if (phase === 'variant') {
      variantGroups.forEach((g) => g.classList.toggle('hidden', g.dataset.variantFor !== selected.slug));
    }

    stepIndicators.forEach((el) => {
      el.classList.toggle('step-primary', Number(el.dataset.stepIndicator) <= INDICATOR_FOR_PHASE[phase]);
    });

    btnBack.classList.toggle('invisible', phase === 'activity');
    btnNext.classList.toggle('hidden', phase === 'confirm');
    btnConfirm.classList.toggle('hidden', phase !== 'confirm' || successBox.dataset.saved === 'true');
    updateNextState();

    if (phase === 'confirm' && selected.name && selectedDate) {
      const label = selected.variant ? `${selected.name} (${selected.variant})` : selected.name;
      summary.textContent = `${label} — ${formatDateIt(selectedDate)}`;
    }
  }

  checkboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        checkboxes.forEach((other) => {
          if (other !== cb) other.checked = false;
        });
        selected = { slug: cb.dataset.slug, name: cb.dataset.name, icon: cb.dataset.icon, variant: null };
      } else {
        selected = { slug: null, name: null, icon: null, variant: null };
      }
      variantButtons.forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline');
      });
      updateNextState();
    });
  });

  variantButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.wizard-variant-group');
      group.querySelectorAll('.variant-btn').forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline');
      });
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-primary');
      selected.variant = btn.dataset.variant;
      updateNextState();
    });
  });

  calendar.addEventListener('change', () => {
    selectedDate = calendar.value;
    updateNextState();
  });

  btnNext.addEventListener('click', () => showStep(nextPhase(currentPhase)));
  btnBack.addEventListener('click', () => showStep(prevPhase(currentPhase)));

  btnConfirm.addEventListener('click', async () => {
    btnConfirm.disabled = true;
    try {
      const activityLabel = selected.variant ? `${selected.name} (${selected.variant})` : selected.name;
      const res = await fetch('/api/eventi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: activityLabel,
          icon: selected.icon,
          event_date: selectedDate,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      icsLink.href = `/api/eventi/${data.id}/ics`;
      successBox.classList.remove('hidden');
      successBox.dataset.saved = 'true';
      btnConfirm.classList.add('hidden');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3500);
    } catch (err) {
      btnConfirm.disabled = false;
      alert('Errore nel salvataggio, riprova.');
    }
  });

  modal.addEventListener('close', () => {
    selected = { slug: null, name: null, icon: null, variant: null };
    selectedDate = null;
    checkboxes.forEach((cb) => (cb.checked = false));
    variantButtons.forEach((b) => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-outline');
    });
    successBox.classList.add('hidden');
    successBox.dataset.saved = 'false';
    btnConfirm.disabled = false;
    showStep('activity');
  });

  showStep('activity');
})();
