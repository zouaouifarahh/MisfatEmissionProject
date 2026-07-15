package com.misfat.userservice.service;

import com.misfat.userservice.dto.UserRegistrationDto;
import com.misfat.userservice.entity.User;
import com.misfat.userservice.entity.Role;
import com.misfat.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final KeycloakService keycloakService;

    // 1. Inscription en attente
    public User registerPendingUser(UserRegistrationDto dto) throws Exception {
        if (userRepository.findByUsername(dto.getUsername()).isPresent()) {
            throw new Exception("Erreur : Cet utilisateur existe déjà !");
        }

        User user = new User();
        user.setUsername(dto.getUsername());
        user.setEmail(dto.getEmail());
        user.setFirstName(dto.getFirstName());
        user.setLastName(dto.getLastName());
        user.setRole(dto.getRole());
        user.setStatus("EN_ATTENTE");

        return userRepository.save(user);
    }

    // 2. Approbation par l'Admin (Création Keycloak + Activation BDD)
    public String approveUser(Long id, String password) throws Exception {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new Exception("Utilisateur introuvable."));

        if ("ACTIF".equals(user.getStatus())) {
            throw new Exception("Cet utilisateur est déjà actif.");
        }

        UserRegistrationDto keycloakDto = new UserRegistrationDto();
        keycloakDto.setUsername(user.getUsername());
        keycloakDto.setEmail(user.getEmail());
        keycloakDto.setFirstName(user.getFirstName());
        keycloakDto.setLastName(user.getLastName());
        keycloakDto.setRole(user.getRole());
        keycloakDto.setPassword(password);

        int status = keycloakService.createUser(keycloakDto);

        if (status == 201) {
            user.setStatus("ACTIF");
            userRepository.save(user);
            return "Utilisateur approuvé avec succès et créé dans Keycloak !";
        } else {
            throw new Exception("Erreur Keycloak (Code HTTP : " + status + ")");
        }
    }

    // 3. Connexion (Calcul automatique de l'accessType pour Angular)
    public Map<String, Object> loginUser(String username) throws Exception {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new Exception("Erreur : Utilisateur non trouvé."));

        if ("EN_ATTENTE".equals(user.getStatus())) {
            throw new Exception("Votre compte est en attente de validation par l'administrateur.");
        }

        String accessType;
        switch (user.getRole()) {
            case ADMINISTRATEUR:
                accessType = "ADMIN";
                break;
            case RESPONSABLE_RSE:
            case CONTRIBUTEUR:
                accessType = "STANDARD_USER";
                break;
            case AUDITEUR:
            case DIRECTION:
                accessType = "VIEWER";
                break;
            default:
                accessType = "VIEWER";
        }

        Map<String, Object> response = new HashMap<>();
        response.put("user", user);
        response.put("accessType", accessType);
        return response;
    }

    public java.util.List<User> getAllUsers() {
        return userRepository.findAll();
    }
}