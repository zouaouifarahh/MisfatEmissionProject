package com.misfat.dataimportservice.seed;

import com.misfat.dataimportservice.entity.ExcelStructureType;
import com.misfat.dataimportservice.entity.ImportSourceType;
import com.misfat.dataimportservice.repository.ImportSourceTypeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Modèles d'import proposés à la saisie.
 *
 * <p>Idempotent : chaque type n'est créé que si son {@code codeName} est absent.
 * Un type déjà présent n'est pas écrasé, pour ne pas défaire une modification
 * faite depuis l'écran d'administration.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ImportSourceTypeSeedLoader {

    private final ImportSourceTypeRepository repository;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void charger() {
        List<ImportSourceType> catalogue = List.of(
                ImportSourceType.builder()
                        .codeName("INVESTISSEMENT")
                        .displayName("Investissements / Immobilisations")
                        .scopeTarget("SCOPE_3")
                        .categoryTarget("Category 2: Capital Goods")
                        .excelStructureType(ExcelStructureType.ROW_BY_ROW)
                        .active(true)
                        .build(),
                ImportSourceType.builder()
                        .codeName("ACHAT_ENERGIE")
                        .displayName("Achats & Énergie")
                        .scopeTarget("SCOPE_2")
                        .categoryTarget("Energy")
                        .excelStructureType(ExcelStructureType.ROW_BY_ROW)
                        .active(true)
                        .build(),
                ImportSourceType.builder()
                        .codeName("FRET_TRANSPORT")
                        .displayName("Fret & Transport")
                        .scopeTarget("SCOPE_3")
                        .categoryTarget("Category 4: Upstream transportation and distribution")
                        .excelStructureType(ExcelStructureType.ROW_BY_ROW)
                        .active(true)
                        .build(),
                ImportSourceType.builder()
                        .codeName("DEPLACEMENT_PRO")
                        .displayName("Déplacements Professionnels")
                        .scopeTarget("SCOPE_3")
                        .categoryTarget("Category 6: Business Travel")
                        .excelStructureType(ExcelStructureType.ROW_BY_ROW)
                        .active(true)
                        .build(),
                ImportSourceType.builder()
                        .codeName("DECHETS_MATRICE")
                        .displayName("Déchets (matrice mensuelle)")
                        .scopeTarget("SCOPE_3")
                        .categoryTarget("Category 5: Waste Generated in Operations")
                        .excelStructureType(ExcelStructureType.MONTHLY_MATRIX)
                        .active(true)
                        .build(),
                ImportSourceType.builder()
                        .codeName("FACTEURS_EMISSION")
                        .displayName("Facteurs d'émission (référentiel)")
                        .scopeTarget("SCOPE_1")
                        .categoryTarget("Référentiel carbone")
                        .excelStructureType(ExcelStructureType.ROW_BY_ROW)
                        .active(true)
                        .build()
        );

        int crees = 0;
        for (ImportSourceType type : catalogue) {
            if (!repository.existsByCodeName(type.getCodeName())) {
                repository.save(type);
                crees++;
            }
        }
        log.info("Modèles d'import — {} créé(s), {} disponible(s) au total", crees, repository.count());
    }
}
