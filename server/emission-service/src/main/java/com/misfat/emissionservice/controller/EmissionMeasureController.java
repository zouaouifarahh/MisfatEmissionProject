package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.EmissionMeasure;
import com.misfat.emissionservice.service.EmissionMeasureService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.misfat.emissionservice.dto.PageMesuresDto;

@RestController
@RequestMapping("/api/v1/emission-measures")
@CrossOrigin(origins = "*")
public class EmissionMeasureController {

    @Autowired
    private EmissionMeasureService service;

    @PostMapping
    public ResponseEntity<EmissionMeasure> create(@RequestBody EmissionMeasure measure) {
        try {
            return ResponseEntity.ok(service.createMeasure(measure));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Page de mesures d'une catégorie, cloisonnée par exercice et par société.
     *
     * <p>La lecture complète — {@code GET /emission-measures} — transmet toute
     * la table. Elle convient aux trente-deux mesures d'aujourd'hui, non aux
     * cent onze mille lignes d'un exercice d'achats : le navigateur les reçoit,
     * les garde en mémoire et les monte dans le document pour n'en montrer
     * cinquante. La pagination revient donc à la base, dont c'est le métier.</p>
     *
     * <p>Les totaux accompagnent la page. Ils ne peuvent pas s'en déduire —
     * cinquante lignes sur cent onze mille n'en disent rien — et sont comptés
     * sur exactement les mêmes critères, sans quoi l'en-tête et le tableau
     * raconteraient deux histoires.</p>
     */
    @GetMapping("/page")
    public ResponseEntity<PageMesuresDto> pager(
            @RequestParam(required = false) String categorie,
            @RequestParam(required = false) Integer annee,
            @RequestParam(required = false) Long filialeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int taille) {

        // Une taille non bornée laisserait un appel demander la table entière,
        // ce que cette route existe précisément pour éviter.
        int tailleRetenue = Math.min(Math.max(taille, 1), 500);

        return ResponseEntity.ok(
                service.pagerParCategorie(categorie, annee, filialeId, page, tailleRetenue));
    }

    // ✅ UNIQUE MÉTHODE GET pour récupérer toutes les mesures (avec ou sans filtre 'category')
    @GetMapping
    public ResponseEntity<List<EmissionMeasure>> getAll(@RequestParam(required = false) String category) {
        if (category != null && !category.isEmpty()) {
            return ResponseEntity.ok(service.getMeasuresByCategory(category));
        }
        return ResponseEntity.ok(service.getAllMeasures());
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmissionMeasure> getById(@PathVariable Long id) {
        return service.getMeasureById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<EmissionMeasure> update(@PathVariable Long id, @RequestBody EmissionMeasure measure) {
        try {
            return service.updateMeasure(id, measure)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (service.deleteMeasure(id)) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}