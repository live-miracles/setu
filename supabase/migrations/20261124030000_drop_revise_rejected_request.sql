-- Returning a rejected request to draft is the `revise` action of
-- perform_inventory_request_action_tx / perform_program_request_action_tx. The
-- standalone function from 20260930000000 has had no caller since the action
-- moved there, so it only drifts out of step with the real transition rules.
drop function if exists public.revise_rejected_request(text, uuid, uuid);
