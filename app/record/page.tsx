import { connection } from 'next/server';
import { ActivityRecorder } from '../../components/activity-recorder';

const recorderHydrationRecovery = `
(function () {
  window.setTimeout(function () {
    var recorder = document.querySelector('[data-recorder-hydrated]');
    if (!recorder || recorder.getAttribute('data-recorder-hydrated') === 'true') return;

    var url = new URL(window.location.href);
    if (!url.searchParams.has('_record_refresh')) {
      url.searchParams.set('_record_refresh', Date.now().toString());
      window.location.replace(url.toString());
      return;
    }

    var note = recorder.querySelector('.start-access-note');
    if (note) {
      note.classList.remove('checking', 'ready');
      note.classList.add('error');
      var title = note.querySelector('strong');
      var detail = note.querySelector('small');
      if (title) title.textContent = 'Activity tools did not load';
      if (detail) detail.textContent = 'Tap reload to fetch the newest secure version.';
    }

    var button = recorder.querySelector('.start-movement-button');
    if (button) {
      button.disabled = false;
      button.textContent = 'Reload activity tools';
      button.onclick = function () {
        url.searchParams.set('_record_refresh', Date.now().toString());
        window.location.replace(url.toString());
      };
    }
  }, 12000);
})();`;

export default async function RecordPage() {
  // This interactive route must not be stored for a year by a shared CDN.
  // A cached HTML shell can reference chunks removed by a later deployment,
  // leaving mobile visitors on a permanently non-interactive "Preparing" UI.
  await connection();

  return <>
    <ActivityRecorder />
    <noscript><p className="recording-start-error">JavaScript is required to start and safely save an activity.</p></noscript>
    <script dangerouslySetInnerHTML={{ __html: recorderHydrationRecovery }} />
  </>;
}
