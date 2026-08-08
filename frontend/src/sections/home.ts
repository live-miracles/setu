import { escapeHtml } from '../ui/format';

export async function renderHome(
    container: HTMLElement,
    dashboard: DashboardPayload,
): Promise<void> {
    const guidelines = dashboard.homeContent.Guidelines.trim();

    container.innerHTML = `
    <section class="home-page mx-auto w-full max-w-[640px] space-y-6">
      <header>
        <div class="ops-kicker">Guidelines</div>
        <h1 class="mt-3 text-3xl font-semibold">Please read before getting started</h1>
      </header>
      <div class="card border border-base-300 bg-base-100 shadow">
        <div class="card-body">
          <p class="whitespace-pre-wrap text-sm leading-relaxed">${
              guidelines ? escapeHtml(guidelines) : 'No guidelines published yet.'
          }</p>
        </div>
      </div>
    </section>
  `;
}
