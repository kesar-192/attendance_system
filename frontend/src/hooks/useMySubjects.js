import { useEffect, useState } from 'react';
import client, { errorMessage } from '../api/client';

/** Subjects taught by the signed-in faculty member. */
export default function useMySubjects() {
  const [state, setState] = useState({ subjects: [], loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    client
      .get('/subjects', { params: { mine: true, limit: 200 } })
      .then(({ data }) => alive && setState({ subjects: data.data, loading: false, error: '' }))
      .catch((err) => alive && setState({ subjects: [], loading: false, error: errorMessage(err) }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
