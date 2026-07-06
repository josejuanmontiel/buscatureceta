import { toDateKey } from './modules/diary/DiaryStore.js';
import * as DiaryStore from './modules/diary/DiaryStore.js';
import * as Analytics from './modules/analytics/DashboardAnalytics.js';

let kcalChartInstance = null;
let weekChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Configuración global de Chart.js para modo oscuro
  Chart.defaults.color = '#adb5bd';
  Chart.defaults.borderColor = '#495057';

  await renderDashboard();
});

async function renderDashboard() {
  const today = toDateKey(new Date());
  
  // 1. Obtener datos
  const dailyProgress = await Analytics.getDailyProgress(today);
  const weeklyVariety = await Analytics.getWeeklyVariety(new Date());
  const weekSummary = await DiaryStore.getWeekSummary(new Date());

  // 2. Renderizar Gráfico Kcal (Doughnut)
  renderKcalChart(dailyProgress);

  // 3. Renderizar Barras de Macros
  renderMacroBars(dailyProgress);

  // 4. Renderizar Lista de Variedad
  renderVarietyList(weeklyVariety);

  // 5. Renderizar Histórico de la Semana (Bar chart)
  renderWeekChart(weekSummary, dailyProgress.goals.kcal);
}

function renderKcalChart(progress) {
  const ctx = document.getElementById('kcalChart').getContext('2d');
  
  const consumed = progress.nutrition.kcal;
  const target = progress.goals.kcal;
  const remaining = Math.max(0, target - consumed);
  const overage = Math.max(0, consumed - target);

  document.getElementById('kcal-text').innerText = `${Math.round(consumed)} / ${target} kcal`;

  if (kcalChartInstance) kcalChartInstance.destroy();

  kcalChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Consumidas', overage > 0 ? 'Exceso' : 'Restantes'],
      datasets: [{
        data: [
          overage > 0 ? target : consumed, 
          overage > 0 ? overage : remaining
        ],
        backgroundColor: [
          '#0d6efd', // azul
          overage > 0 ? '#dc3545' : '#333' // rojo si exceso, oscuro si falta
        ],
        borderWidth: 0,
        cutout: '75%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function renderMacroBars(progress) {
  const { nutrition, goals, percentages } = progress;

  const updateBar = (id, current, target, pct) => {
    document.getElementById(`macro-${id}-text`).innerText = `${Math.round(current)}/${target}g`;
    const bar = document.getElementById(`macro-${id}-bar`);
    bar.style.width = `${Math.min(100, pct)}%`;
    if (pct > 100) bar.classList.add('bg-danger'); // alerta exceso
  };

  updateBar('prot', nutrition.proteins_g, goals.proteins_g, percentages.proteins);
  updateBar('carb', nutrition.carbs_g, goals.carbohydrates_g, percentages.carbs);
  updateBar('fat', nutrition.fat_g, goals.fat_g, percentages.fat);
  updateBar('fiber', nutrition.fiber_g, goals.fiber_g, percentages.fiber);
}

function renderVarietyList(variety) {
  document.getElementById('variety-score').innerText = `${variety.score}%`;
  
  const container = document.getElementById('variety-list');
  const items = Object.entries(variety.groupCounts)
    .sort((a, b) => b[1] - a[1]); // ordenar por consumidos primero

  container.innerHTML = items.map(([key, count]) => {
    const groupDef = variety.groupsData[key];
    const isConsumed = count > 0;
    
    return `
      <div class="variety-item">
        <div>
          <span class="fs-5 me-2">${groupDef.icon}</span>
          ${groupDef.label}
        </div>
        <div>
          ${isConsumed 
            ? `<span class="variety-status-ok"><i class="bi bi-check-circle-fill"></i> Ok</span>`
            : `<span class="variety-status-warn small">Falta</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function renderWeekChart(weekSummary, targetKcal) {
  const ctx = document.getElementById('weekChart').getContext('2d');
  
  const labels = weekSummary.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('es', { weekday: 'short' });
  });

  const data = weekSummary.map(d => Math.round(d.nutrition.kcal));

  if (weekChartInstance) weekChartInstance.destroy();

  weekChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Calorías Consumidas',
        data,
        backgroundColor: '#0d6efd',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#333' }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        annotation: { // Requiere plugin chartjs-plugin-annotation si se quiere la linea
          annotations: {
            line1: {
              type: 'line',
              yMin: targetKcal,
              yMax: targetKcal,
              borderColor: '#ffc107',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Objetivo',
                enabled: true,
                position: 'end'
              }
            }
          }
        }
      }
    }
  });
}
