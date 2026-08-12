const data = window.WEBAULAS_DATA;
const appState = {
  selectedId: localStorage.getItem('webaulas:selected') || 'all',
  selectedDate: localStorage.getItem('webaulas:selectedDate') || '',
};

const classDays = new Set([2, 3, 4]);
const weekdayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dayClassOrder = {
  2: [
    'Antropologia Cristã',
    'Interação Humano-Computador',
  ],
  3: [
    'Leitura e Produção de Texto',
    'Construção de Algoritmos e Programação',
  ],
  4: [
    'Cálculo I',
  ],
};
const dayTimeBlocks = {
  2: ['19:45 - 21:30', '21:30 - 23:00'],
  3: ['19:45 - 21:30', '21:30 - 23:00'],
  4: ['19:45 - 21:30', '21:30 - 23:00'],
};
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const elements = {
  generatedAt: document.getElementById('generated-at'),
  todayPill: document.getElementById('today-pill'),
  datePicker: document.getElementById('date-picker'),
  datePickerLabel: document.getElementById('date-picker-label'),
  nextClassTitle: document.getElementById('next-class-title'),
  nextClassSummary: document.getElementById('next-class-summary'),
  nextClassMeta: document.getElementById('next-class-meta'),
  nextEvalTitle: document.getElementById('next-eval-title'),
  nextEvalSummary: document.getElementById('next-eval-summary'),
  nextEvalMeta: document.getElementById('next-eval-meta'),
  chips: document.getElementById('discipline-chips'),
  courseGrid: document.getElementById('course-grid'),
  detailTitle: document.getElementById('detail-title'),
  detailSubtitle: document.getElementById('detail-subtitle'),
  detailList: document.getElementById('detail-list'),
};

function parseDate(value) {
  const [day, month, yearRaw] = value.split('/').map(Number);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  return new Date(year, month - 1, day);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function formatDateLong(value) {
  const parsed = typeof value === 'string' ? parseDate(value) : value;
  return dateFormatter.format(parsed).replace(/^(\w)/, (letter) => letter.toUpperCase());
}

function formatDateShort(value) {
  const parsed = typeof value === 'string' ? parseDate(value) : value;
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function weekdayLabel(value) {
  const parsed = typeof value === 'string' ? parseDate(value) : value;
  return weekdayNames[parsed.getDay()];
}

function isClassDay(value) {
  const parsed = typeof value === 'string' ? parseDate(value) : value;
  return classDays.has(parsed.getDay());
}

function normalizeDiscipline(discipline) {
  const schedule = discipline.schedule
    .map((item) => ({
      ...item,
      kind: 'class',
      dateObj: parseDate(item.date),
    }))
    .sort((left, right) => left.dateObj - right.dateObj);

  const evaluations = discipline.evaluations
    .map((item) => ({
      ...item,
      kind: 'evaluation',
      dateObj: parseDate(item.date),
    }))
    .sort((left, right) => left.dateObj - right.dateObj);

  const events = [...schedule, ...evaluations].sort((left, right) => left.dateObj - right.dateObj || left.kind.localeCompare(right.kind));

  return {
    ...discipline,
    schedule,
    evaluations,
    events,
  };
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function nextItem(items) {
  const today = stripTime(new Date());
  return items.find((item) => item.dateObj >= today) || null;
}

function collectClassDates(disciplines) {
  const dates = new Map();

  disciplines.forEach((discipline) => {
    discipline.schedule.forEach((item) => {
      if (!isClassDay(item.dateObj)) {
        return;
      }
      const key = item.date;
      if (!dates.has(key)) {
        dates.set(key, item.dateObj);
      }
    });
  });

  return [...dates.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([value, dateObj]) => ({ value, label: formatDateLong(dateObj), dateObj }));
}

function getSelectedDate(classDates) {
  const today = stripTime(new Date());
  const stored = appState.selectedDate ? parseDate(appState.selectedDate) : null;
  const selected = stored && classDates.some((item) => sameDay(item.dateObj, stored)) ? stored : null;
  if (selected) {
    return selected;
  }
  const todayMatch = classDates.find((item) => sameDay(item.dateObj, today));
  if (todayMatch) {
    return todayMatch.dateObj;
  }
  return classDates[0]?.dateObj || today;
}

function getClassesForDate(disciplines, selectedDate) {
  const targetWeekday = selectedDate.getDay();
  return disciplines
    .flatMap((discipline) =>
      discipline.schedule
        .filter((item) => sameDay(item.dateObj, selectedDate) && isClassDay(item.dateObj))
        .map((item) => ({
          ...item,
          disciplineId: discipline.slug,
          disciplineTitle: discipline.title,
          weekdayOrder: (dayClassOrder[targetWeekday] || []).indexOf(discipline.title),
        })),
    )
    .sort((left, right) => {
      const leftIndex = left.weekdayOrder === -1 ? 999 : left.weekdayOrder;
      const rightIndex = right.weekdayOrder === -1 ? 999 : right.weekdayOrder;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.disciplineTitle.localeCompare(right.disciplineTitle);
    });
}

function buildGlobalEvents(disciplines) {
  const classDates = collectClassDates(disciplines);
  const selectedDate = getSelectedDate(classDates);
  const classEvents = disciplines.flatMap((discipline) =>
    discipline.schedule
      .filter((item) => sameDay(item.dateObj, selectedDate) && isClassDay(item.dateObj))
      .map((item) => ({
        ...item,
        disciplineId: discipline.slug,
        disciplineTitle: discipline.title,
      })),
  );

  const evaluationEvents = disciplines.flatMap((discipline) =>
    discipline.evaluations
      .filter((item) => item.dateObj >= selectedDate)
      .map((item) => ({
        ...item,
        disciplineId: discipline.slug,
        disciplineTitle: discipline.title,
      })),
  );

  classEvents.sort((left, right) => {
    const weekday = selectedDate.getDay();
    const order = dayClassOrder[weekday] || [];
    const leftIndex = order.indexOf(left.disciplineTitle);
    const rightIndex = order.indexOf(right.disciplineTitle);
    if (leftIndex !== rightIndex) {
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    }
    return left.disciplineTitle.localeCompare(right.disciplineTitle);
  });
  evaluationEvents.sort((left, right) => left.dateObj - right.dateObj || left.disciplineTitle.localeCompare(right.disciplineTitle));

  return {
    selectedDate,
    classDates,
    todayClasses: classEvents,
    nextEvaluation: evaluationEvents[0] || null,
  };
}

function renderChips(disciplines) {
  const chips = [
    {
      id: 'all',
      title: 'Todas',
      active: appState.selectedId === 'all',
    },
    ...disciplines.map((discipline) => ({
      id: discipline.slug,
      title: discipline.title,
      active: appState.selectedId === discipline.slug,
    })),
  ];

  elements.chips.innerHTML = chips
    .map(
      (chip) => `
        <button class="chip ${chip.active ? 'is-active' : ''}" type="button" data-id="${chip.id}">${chip.title}</button>
      `,
    )
    .join('');

  elements.chips.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      appState.selectedId = button.dataset.id;
      localStorage.setItem('webaulas:selected', appState.selectedId);
      render();
    });
  });
}

function renderSummaryCard(card, title, subtitle, metaItems) {
  card.title = title;
  card.subtitle = subtitle;
  card.meta = metaItems;
}

function renderSpotlight(globalEvents) {
  const nextClasses = globalEvents.todayClasses || [];
  const nextEval = globalEvents.nextEvaluation;
  const selectedDate = globalEvents.selectedDate || stripTime(new Date());
  const todayWeekday = selectedDate.getDay();
  const timeBlocks = dayTimeBlocks[todayWeekday] || [];

  if (nextClasses.length) {
    elements.nextClassTitle.textContent = 'Aulas do dia';
    elements.nextClassSummary.innerHTML = nextClasses
      .map((item, index) => {
        const timeLabel = timeBlocks[index] || '';
        return `
        <div class="class-snapshot">
          <div class="class-snapshot-head">
            <strong>${compactText(item.disciplineTitle)}</strong>
            <span>${timeLabel || formatDateLong(item.dateObj)}</span>
          </div>
          <p>${compactText(item.summary || item.raw)}</p>
        </div>
      `;
      })
      .join('');
    elements.nextClassMeta.innerHTML = [
      `<span class="meta-chip">${nextClasses.length} aulas hoje</span>`,
      `<span class="meta-chip">${formatDateLong(selectedDate)}</span>`,
      `<span class="meta-chip">Conteúdo do dia</span>`,
    ].join('');
  } else {
    elements.nextClassTitle.textContent = 'Nenhuma aula encontrada';
    elements.nextClassSummary.textContent = 'Os PDFs não têm registros de aula para a data escolhida.';
    elements.nextClassMeta.innerHTML = '';
  }

  if (nextEval) {
    elements.nextEvalTitle.textContent = nextEval.disciplineTitle;
    elements.nextEvalSummary.textContent = compactText(nextEval.label);
    elements.nextEvalMeta.innerHTML = [
      `<span class="meta-chip">${formatDateLong(nextEval.dateObj)}</span>`,
      `<span class="meta-chip">${nextEval.weight || 'peso não informado'}</span>`,
      `<span class="meta-chip">Instrumento avaliativo</span>`,
    ].join('');
  } else {
    elements.nextEvalTitle.textContent = 'Nenhuma avaliação futura encontrada';
    elements.nextEvalSummary.textContent = 'Os PDFs não têm mais avaliações após a data de hoje.';
    elements.nextEvalMeta.innerHTML = '';
  }
}

function renderCourseGrid(disciplines) {
  elements.courseGrid.innerHTML = disciplines
    .map((discipline) => {
      const nextClass = nextItem(discipline.schedule.filter((item) => item.dateObj >= stripTime(new Date()) && isClassDay(item.dateObj)));
      const nextEval = nextItem(discipline.evaluations.filter((item) => item.dateObj >= stripTime(new Date())));
      const active = appState.selectedId === discipline.slug;
      const classLabel = nextClass ? `${formatDateShort(nextClass.dateObj)} · ${weekdayLabel(nextClass.dateObj)}` : 'Sem aula futura';
      const evalLabel = nextEval ? `${formatDateShort(nextEval.dateObj)} · ${nextEval.weight || ''}`.trim() : 'Sem avaliação futura';

      return `
        <button class="course-card ${active ? 'is-selected' : ''}" type="button" data-id="${discipline.slug}">
          <div class="course-topline">
            <span class="badge">${discipline.schedule.length} aulas</span>
            <span class="badge">${discipline.evaluations.length} avaliações</span>
          </div>
          <h4>${discipline.title}</h4>
          <p>${compactText(nextClass ? nextClass.summary : discipline.schedule[0]?.summary || 'Nenhum conteúdo encontrado')}</p>
          <div class="course-metrics">
            <div class="metric"><span>Próxima aula</span><strong>${classLabel}</strong></div>
            <div class="metric"><span>Próxima avaliação</span><strong>${evalLabel}</strong></div>
          </div>
        </button>
      `;
    })
    .join('');

  elements.courseGrid.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      appState.selectedId = button.dataset.id;
      localStorage.setItem('webaulas:selected', appState.selectedId);
      render();
    });
  });
}

function renderDatePicker(classDates, selectedDate) {
  elements.datePicker.innerHTML = classDates
    .map((item) => `<option value="${item.value}" ${sameDay(item.dateObj, selectedDate) ? 'selected' : ''}>${item.label}</option>`)
    .join('');

  elements.datePicker.value = classDates.find((item) => sameDay(item.dateObj, selectedDate))?.value || '';
  elements.datePickerLabel.textContent = `Escolha uma data de terça, quarta ou quinta`;

  elements.datePicker.onchange = () => {
    appState.selectedDate = elements.datePicker.value;
    localStorage.setItem('webaulas:selectedDate', appState.selectedDate);
    render();
  };
}

function renderTimeline(discipline) {
  elements.detailTitle.textContent = discipline.title;
  elements.detailSubtitle.textContent = `${discipline.schedule.length} aulas e ${discipline.evaluations.length} avaliações registradas`;

  const events = discipline.events.filter((event) => event.dateObj >= stripTime(new Date()));
  const selectedEvents = events.length ? events.slice(0, 8) : discipline.events.slice(0, 8);

  if (!selectedEvents.length) {
    elements.detailList.innerHTML = '<div class="empty-state">Não há registros suficientes neste PDF.</div>';
    return;
  }

  elements.detailList.innerHTML = selectedEvents
    .map((event) => {
      const title = event.kind === 'class' ? 'Conteúdo de aula' : 'Avaliação';
      const descriptor = event.kind === 'class' ? compactText(event.summary || event.raw) : compactText(event.label);
      const metaPrimary = event.kind === 'class' ? formatDateLong(event.dateObj) : formatDateLong(event.dateObj);
      const metaSecondary = event.kind === 'class' ? weekdayLabel(event.dateObj) : event.weight || 'sem peso';
      const extra = event.kind === 'class'
        ? [
            { label: 'Tipo', value: 'Aula' },
            { label: 'Dia', value: weekdayLabel(event.dateObj) },
            { label: 'Regra', value: isClassDay(event.dateObj) ? 'Ter/Qua/Qui' : 'Outro dia' },
          ]
        : [
            { label: 'Tipo', value: 'Avaliação' },
            { label: 'Peso', value: event.weight || 'n/d' },
            { label: 'ID', value: event.label.split(' - ')[0] || 'n/d' },
          ];

      return `
        <article class="detail-item fade-in">
          <div class="detail-head">
            <div>
              <div class="spotlight-label">${title}</div>
              <h4>${metaPrimary}</h4>
            </div>
            <span class="badge">${metaSecondary}</span>
          </div>
          <p>${descriptor || 'Sem resumo extraído do PDF.'}</p>
          <div class="detail-grid">
            ${extra
              .map(
                (item) => `
                <div class="detail-stat">
                  <span>${item.label}</span>
                  <strong>${item.value}</strong>
                </div>
              `,
              )
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
}

function render() {
  const disciplines = data.disciplines.map(normalizeDiscipline);
  const selected = appState.selectedId === 'all'
    ? disciplines[0]
    : disciplines.find((discipline) => discipline.slug === appState.selectedId) || disciplines[0];
  const globalEvents = buildGlobalEvents(disciplines);
  const selectedDate = globalEvents.selectedDate || stripTime(new Date());

  renderChips(disciplines);
  renderDatePicker(globalEvents.classDates || [], selectedDate);
  renderCourseGrid(disciplines);
  renderTimeline(selected);
  renderSpotlight(globalEvents);

  elements.generatedAt.textContent = `Dados gerados em ${data.generatedAt}`;
  elements.todayPill.textContent = `Data selecionada: ${formatDateLong(selectedDate)}`;
}

function init() {
  if (!data || !Array.isArray(data.disciplines)) {
    elements.detailList.innerHTML = '<div class="empty-state">Não foi possível carregar os dados extraídos dos PDFs.</div>';
    return;
  }

  render();
}

init();
