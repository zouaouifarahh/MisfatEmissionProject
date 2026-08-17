package com.misfat.organizationservice.seed;

import com.misfat.organizationservice.entity.CurrencyExchangeRate;
import com.misfat.organizationservice.repository.CurrencyExchangeRateRepository;
import org.apache.poi.ss.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Chargement des cours de change depuis « devise_base_misfat_tunisie.xlsx ».
 *
 * <p>Colonnes attendues : {@code CoursApplique}, {@code VALIDFROM},
 * {@code VALIDTO}, {@code FROMCURRENCYCODE}. Un cours se lit « 1 devise =
 * CoursApplique TND ».</p>
 *
 * <p>Idempotent : le couple (devise, date de début) porte une contrainte
 * d'unicité et n'est inséré qu'une fois. Le TND est ajouté comme pivot à 1.</p>
 */
@Component
public class CurrencyRateSeedLoader {

    private static final Logger log = LoggerFactory.getLogger(CurrencyRateSeedLoader.class);

    private static final String NOM_FICHIER = "devise_base_misfat_tunisie.xlsx";
    private static final LocalDate DEBUT_PIVOT = LocalDate.of(2000, 1, 1);

    private final CurrencyExchangeRateRepository repository;

    @Value("${misfat.seed.currency-file:../../" + NOM_FICHIER + "}")
    private String cheminFichier;

    @Value("${misfat.seed.enabled:true}")
    private boolean actif;

    public CurrencyRateSeedLoader(CurrencyExchangeRateRepository repository) {
        this.repository = repository;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void charger() {
        if (!actif) {
            log.info("Seed des cours de change désactivé (misfat.seed.enabled=false)");
            return;
        }

        int inseres = ajouterPivot();
        int ignores = 0;

        Path fichier = resoudreFichier();
        if (fichier == null) {
            log.warn("Fichier de devises introuvable ({}) : seul le pivot TND est en base", cheminFichier);
            return;
        }

        try (InputStream flux = Files.newInputStream(fichier);
             Workbook classeur = WorkbookFactory.create(flux)) {

            Sheet feuille = classeur.getSheetAt(0);
            DataFormatter formatteur = new DataFormatter();

            // Le fichier contient plusieurs lignes par devise et par date ; on
            // dédoublonne en mémoire avant d'interroger la base.
            Set<String> vus = new HashSet<>();
            List<CurrencyExchangeRate> aInserer = new ArrayList<>();

            for (int i = 1; i <= feuille.getLastRowNum(); i++) {
                Row ligne = feuille.getRow(i);
                if (ligne == null) {
                    continue;
                }
                String devise = texte(ligne.getCell(3), formatteur);
                BigDecimal cours = decimal(ligne.getCell(0), formatteur);
                LocalDate debut = date(ligne.getCell(1), formatteur);
                LocalDate fin = date(ligne.getCell(2), formatteur);

                if (devise == null || cours == null || debut == null) {
                    ignores++;
                    continue;
                }
                devise = devise.toUpperCase(Locale.ROOT);
                if (devise.length() > 3) {
                    devise = devise.substring(0, 3);
                }

                String cle = devise + "@" + debut;
                if (!vus.add(cle) || repository.existsByCurrencyCodeAndValidFrom(devise, debut)) {
                    continue;
                }
                aInserer.add(new CurrencyExchangeRate(devise, cours, debut, fin));
            }

            if (!aInserer.isEmpty()) {
                repository.saveAll(aInserer);
                inseres += aInserer.size();
            }
        } catch (Exception e) {
            log.error("Chargement des cours de change impossible : {}", e.getMessage(), e);
            return;
        }

        log.info("Cours de change — {} nouveaux cours insérés, {} lignes ignorées, {} en base",
                inseres, ignores, repository.count());
    }

    /** Le pivot n'est pas dans le fichier : 1 TND = 1 TND, ajouté une seule fois. */
    private int ajouterPivot() {
        if (repository.existsByCurrencyCodeAndValidFrom(CurrencyExchangeRate.PIVOT, DEBUT_PIVOT)) {
            return 0;
        }
        repository.save(new CurrencyExchangeRate(
                CurrencyExchangeRate.PIVOT, BigDecimal.ONE, DEBUT_PIVOT, null));
        return 1;
    }

    private Path resoudreFichier() {
        List<Path> candidats = List.of(
                Path.of(cheminFichier),
                Path.of("..", "..", NOM_FICHIER),
                Path.of("..", NOM_FICHIER),
                Path.of(NOM_FICHIER));

        for (Path candidat : candidats) {
            if (Files.isRegularFile(candidat)) {
                log.info("Cours de change lus depuis {}", candidat.toAbsolutePath().normalize());
                return candidat;
            }
        }
        return null;
    }

    private String texte(Cell cellule, DataFormatter formatteur) {
        if (cellule == null) {
            return null;
        }
        String valeur = formatteur.formatCellValue(cellule).trim();
        return valeur.isEmpty() ? null : valeur;
    }

    private BigDecimal decimal(Cell cellule, DataFormatter formatteur) {
        if (cellule == null) {
            return null;
        }
        if (cellule.getCellType() == CellType.NUMERIC) {
            return BigDecimal.valueOf(cellule.getNumericCellValue());
        }
        String brut = formatteur.formatCellValue(cellule)
                .replaceAll("[\\s\\u00A0\\u202F]", "")
                .replace(',', '.');
        try {
            return brut.isEmpty() ? null : new BigDecimal(brut);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Les dates arrivent en texte « 2026-08-02 00:00:00.000 » ou en cellule datée. */
    private LocalDate date(Cell cellule, DataFormatter formatteur) {
        if (cellule == null) {
            return null;
        }
        if (cellule.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cellule)) {
            LocalDateTime horodatage = cellule.getLocalDateTimeCellValue();
            return horodatage == null ? null : horodatage.toLocalDate();
        }
        String brut = formatteur.formatCellValue(cellule).trim();
        if (brut.isEmpty()) {
            return null;
        }
        if (brut.length() >= 10) {
            try {
                return LocalDate.parse(brut.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE);
            } catch (Exception ignored) {
                // format suivant
            }
        }
        for (String motif : new String[]{"dd/MM/uuuu", "d/M/uuuu", "uuuu/MM/dd"}) {
            try {
                return LocalDate.parse(brut, DateTimeFormatter.ofPattern(motif));
            } catch (Exception ignored) {
                // abandon
            }
        }
        return null;
    }
}
