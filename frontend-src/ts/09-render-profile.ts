async function renderProfile(container: HTMLElement, dashboard: DashboardPayload): Promise<void> {
    const me = dashboard.me;
    container.innerHTML = `
    <section class="space-y-6">
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          <h2 class="card-title">Your profile</h2>
          <form id="profile-form" class="space-y-2">
            <input name="name" class="input input-bordered w-full" value="${escapeHtml(me.Name)}" placeholder="Name" required />
            <input name="phone" class="input input-bordered w-full" value="${escapeHtml(me.Phone)}" placeholder="Phone" />
            <input name="whatsapp" class="input input-bordered w-full" value="${escapeHtml(me.Whatsapp)}" placeholder="WhatsApp" />
            <input name="timezone" class="input input-bordered w-full" value="${escapeHtml(me.Timezone)}" placeholder="Timezone" />
            <label class="label cursor-pointer justify-start gap-2">
              <input type="checkbox" name="notificationEmail" class="checkbox" ${me.NotificationEmail ? 'checked' : ''} />
              <span>Email me about notifications</span>
            </label>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
      </div>
    </section>
  `;

    const form = document.getElementById('profile-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        try {
            showSavingBadge(true);
            await api.updateOwnProfile({
                name: String(data.get('name')),
                phone: String(data.get('phone') || ''),
                whatsapp: String(data.get('whatsapp') || ''),
                timezone: String(data.get('timezone') || ''),
                notificationEmail: data.get('notificationEmail') === 'on',
            });
            await refreshDashboard();
        } catch (err) {
            showErrorAlert(err);
        } finally {
            showSavingBadge(false);
        }
    });
}
