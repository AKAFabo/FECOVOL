-- Migration: 004_catalog_values_seed
-- Frente: Asociaciones y Arbitraje (Estudiante 3)
-- Valores de catalogo que necesitan equipos, personas, documentos y designaciones.
-- Se cargan con el procedimiento del frente de Seguridad para que queden en bitacora.

DO $$
BEGIN
    PERFORM public.sp_upsert_catalog_value('Categorías','MAYOR','Mayor','Sin limite de edad',true,'seed');
    PERFORM public.sp_upsert_catalog_value('Categorías','U21','Sub-21',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Categorías','U19','Sub-19',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Categorías','U17','Sub-17',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Categorías','U15','Sub-15',NULL,true,'seed');

    PERFORM public.sp_upsert_catalog_value('Ramas','FEM','Femenina',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Ramas','MAS','Masculina',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Ramas','MIX','Mixta',NULL,true,'seed');

    PERFORM public.sp_upsert_catalog_value('Modalidades','SALA','Sala',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Modalidades','PLAYA','Playa',NULL,true,'seed');

    PERFORM public.sp_upsert_catalog_value('Posiciones','ARM','Armador(a)',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Posiciones','OPU','Opuesto(a)',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Posiciones','CEN','Central',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Posiciones','REC','Receptor(a)',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Posiciones','LIB','Líbero',NULL,true,'seed');

    PERFORM public.sp_upsert_catalog_value('Tipos de documento','CED','Cédula de identidad','Identificación de la persona',true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','PAS','Pasaporte',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','DIMEX','DIMEX',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','MED','Constancia médica deportiva','Vence al año',true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','LIC','Licencia de entrenador',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','POL','Póliza de riesgos del trabajo',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','PER','Personería jurídica',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','EST','Estatutos de la asociación',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de documento','ACT','Acta de asamblea',NULL,true,'seed');

    PERFORM public.sp_upsert_catalog_value('Tipos de oficial','PRI','Árbitro principal',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de oficial','SEG','Segundo árbitro',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de oficial','ANO','Anotador(a)',NULL,true,'seed');
    PERFORM public.sp_upsert_catalog_value('Tipos de oficial','LIN','Juez de línea',NULL,true,'seed');
END $$;
