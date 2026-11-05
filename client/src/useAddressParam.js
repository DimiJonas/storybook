// Something opened on top of a page, kept in the address (e.g. ?foto=12, ?verlauf=1), so the
// phone's back button closes it instead of leaving the page:
//   const { value, open, show, close } = useAddressParam('foto');
//   open(v)   opens it (a new history entry – "back" closes it)
//   show(v)   changes it while open (no new history entry)
//   close()   closes it (goes back, or – if the page was opened with ?foto=... – removes it)
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export const useAddressParam = (name) => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const opened = `opened-${name}`; // marks history entries this page added
  const withValue = (value) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(name);
    else next.set(name, String(value));
    return next;
  };
  const open = (value) => setParams(withValue(value), { state: { ...location.state, [opened]: true }, preventScrollReset: true });
  const show = (value) => setParams(withValue(value), { replace: true, state: location.state, preventScrollReset: true });
  const close = () => {
    if (location.state?.[opened]) navigate(-1);
    else setParams(withValue(null), { replace: true, state: location.state, preventScrollReset: true });
  };
  return { value: params.get(name), open, show, close };
};
