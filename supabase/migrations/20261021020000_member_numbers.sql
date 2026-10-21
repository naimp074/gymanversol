-- Anversol Gym · los números de socio empiezan en 1
--
-- Renumera los socios existentes por orden de alta (1, 2, 3…) y deja el
-- contador listo para el siguiente. Ninguna tabla referencia el número:
-- ingresos, pagos y QR usan el id interno.

alter sequence public.member_number_seq minvalue 1;

-- Dos pasos para no chocar con la restricción de número único.
update public.members set number = 'tmp-' || id::text;
update public.members m set number = r.n::text
from (select id, row_number() over (order by created_at, id) as n from public.members) r
where r.id = m.id;

select setval('public.member_number_seq', greatest((select count(*) from public.members), 1), (select count(*) > 0 from public.members));
