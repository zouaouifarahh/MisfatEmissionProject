package com.misfat.dataimportservice.service;

import com.misfat.dataimportservice.dto.ImportSourceTypeDTO;

import java.util.List;

/** Mini-CRUD des modèles de fichiers Excel supportés. */
public interface ImportSourceTypeService {

    List<ImportSourceTypeDTO> findAll();

    /** Seuls les types actifs, triés par libellé — vue destinée aux écrans d'import. */
    List<ImportSourceTypeDTO> findAllActive();

    List<ImportSourceTypeDTO> findActiveByScope(String scopeTarget);

    ImportSourceTypeDTO findById(Long id);

    ImportSourceTypeDTO findByCodeName(String codeName);

    ImportSourceTypeDTO create(ImportSourceTypeDTO dto);

    ImportSourceTypeDTO update(Long id, ImportSourceTypeDTO dto);

    /** Suppression logique : bascule {@code active} à {@code false}. */
    ImportSourceTypeDTO deactivate(Long id);

    ImportSourceTypeDTO activate(Long id);
}
