-- Atomic queue management for launchpad-run (max 2 concurrent runs)
-- The queue state is stored in app_data under the key 'lp_global_queue'
-- as a proper jsonb object (not a stringified JSON — this row is managed
-- exclusively by these functions, not by the JS edge function).

-- Claim a launchpad slot. Returns {"status":"running"} if a slot was free,
-- or {"status":"queued","position":N} if all slots are taken.
CREATE OR REPLACE FUNCTION lp_claim_slot(
  p_ws_id      text,
  p_job_id     text,
  p_params     jsonb,
  p_user_email text DEFAULT '',
  p_app_url    text DEFAULT '',
  p_max        int  DEFAULT 2
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_queue   jsonb;
  v_running jsonb;
  v_pending jsonb;
  v_pos     int;
BEGIN
  -- Ensure the queue row exists so we can lock it
  INSERT INTO app_data (key, value)
  VALUES ('lp_global_queue', '{"running":[],"pending":[]}'::jsonb)
  ON CONFLICT (key) DO NOTHING;

  SELECT value INTO v_queue
  FROM app_data WHERE key = 'lp_global_queue'
  FOR UPDATE;

  v_running := COALESCE(v_queue -> 'running', '[]'::jsonb);
  v_pending := COALESCE(v_queue -> 'pending', '[]'::jsonb);

  IF jsonb_array_length(v_running) < p_max THEN
    -- Slot available — add to running
    v_running := v_running || jsonb_build_object(
      'wsId',      p_ws_id,
      'jobId',     p_job_id,
      'startedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
    UPDATE app_data
    SET value = jsonb_set(jsonb_set(v_queue, '{running}', v_running), '{pending}', v_pending)
    WHERE key = 'lp_global_queue';
    RETURN jsonb_build_object('status', 'running');
  ELSE
    -- All slots taken — add to pending queue
    v_pos := jsonb_array_length(v_pending) + 1;
    v_pending := v_pending || jsonb_build_object(
      'wsId',      p_ws_id,
      'jobId',     p_job_id,
      'params',    p_params,
      'userEmail', p_user_email,
      'appUrl',    p_app_url,
      'queuedAt',  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
    UPDATE app_data
    SET value = jsonb_set(v_queue, '{pending}', v_pending)
    WHERE key = 'lp_global_queue';
    RETURN jsonb_build_object('status', 'queued', 'position', v_pos);
  END IF;
END;
$$;

-- Release a slot and return the next pending job (if any).
-- The returned job is already moved into the running list so the caller
-- can fire it without another claim.
CREATE OR REPLACE FUNCTION lp_release_slot(p_ws_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_queue   jsonb;
  v_running jsonb;
  v_pending jsonb;
  v_next    jsonb;
BEGIN
  SELECT value INTO v_queue
  FROM app_data WHERE key = 'lp_global_queue'
  FOR UPDATE;

  IF v_queue IS NULL THEN RETURN NULL; END IF;

  v_running := COALESCE(v_queue -> 'running', '[]'::jsonb);
  v_pending := COALESCE(v_queue -> 'pending', '[]'::jsonb);

  -- Remove this workspace from running
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_running
  FROM jsonb_array_elements(v_running) AS e
  WHERE e ->> 'wsId' != p_ws_id;

  -- Pop the first pending job and move it to running
  v_next := NULL;
  IF jsonb_array_length(v_pending) > 0 THEN
    v_next := v_pending -> 0;
    SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_pending
    FROM jsonb_array_elements(v_pending) WITH ORDINALITY AS t(e, ord)
    WHERE t.ord > 1;
    v_running := v_running || jsonb_build_object(
      'wsId',      v_next ->> 'wsId',
      'jobId',     v_next ->> 'jobId',
      'startedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  UPDATE app_data
  SET value = jsonb_set(jsonb_set(v_queue, '{running}', v_running), '{pending}', v_pending)
  WHERE key = 'lp_global_queue';

  RETURN v_next;
END;
$$;
