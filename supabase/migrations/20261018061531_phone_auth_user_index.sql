create index phone_auth_user_id on public.phone_auth_challenges(user_id) where user_id is not null;
