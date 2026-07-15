package com.misfat.userservice.service;

import com.misfat.userservice.dto.UserRegistrationDto;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.ws.rs.core.Response;
import java.util.Collections;

@Service
public class KeycloakService {

    @Value("${keycloak.auth-server-url}")
    private String serverUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    private Keycloak getKeycloakInstance() {
        return KeycloakBuilder.builder()
                .serverUrl(serverUrl)
                .realm(realm)
                .clientId(clientId)
                .clientSecret(clientSecret)
                .grantType("client_credentials")
                .build();
    }

    public int createUser(UserRegistrationDto userDto) {
        UserRepresentation user = new UserRepresentation();
        user.setEnabled(true);
        user.setUsername(userDto.getUsername());
        user.setEmail(userDto.getEmail());
        user.setFirstName(userDto.getFirstName());
        user.setLastName(userDto.getLastName());
        user.setEmailVerified(true);

        // Configuration du mot de passe dans Keycloak
        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setTemporary(false);
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(userDto.getPassword());
        user.setCredentials(Collections.singletonList(credential));

        Keycloak keycloak = getKeycloakInstance();
        Response response = keycloak.realm(realm).users().create(user);

        return response.getStatus(); // Retournera 201 si tout se passe bien
    }
}