package com.plutoshop.api.error;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import com.plutoshop.api.admin.AdminProductConflictException;
import com.plutoshop.api.admin.AdminProductGroupNotFoundException;
import com.plutoshop.api.admin.AdminProductNotFoundException;
import com.plutoshop.api.cart.CartLockedException;
import com.plutoshop.api.payment.PaymentConfigurationException;
import com.plutoshop.api.payment.PaymentConflictException;
import com.plutoshop.api.payment.PaymentGatewayException;
import com.plutoshop.api.payment.PaymentNotFoundException;
import com.plutoshop.api.payment.PromptPayUnavailableException;
import com.plutoshop.api.productimage.ProductImageNotFoundException;
import com.plutoshop.api.productimage.ProductImageStorageException;
import com.plutoshop.api.productimage.ProductImageTooLargeException;
import com.plutoshop.api.productimage.ProductImageValidationException;
import com.plutoshop.api.fulfillment.FulfillmentConflictException;
import com.plutoshop.api.fulfillment.FulfillmentNotFoundException;
import com.plutoshop.api.fulfillment.FulfillmentPayloadValidationException;
import com.plutoshop.api.fulfillment.FulfillmentSecretConfigurationException;
import com.plutoshop.api.fulfillment.FulfillmentSecretException;

@RestControllerAdvice
class ApiExceptionHandler {

    private static final URI ABOUT_BLANK = URI.create("about:blank");
    private static final String INVALID_PARAMETERS_TITLE = "Invalid request parameters";

    @ExceptionHandler(InvalidRequestParameterException.class)
    ResponseEntity<SanitizedProblemDetail> handleInvalidRequestParameter(
            InvalidRequestParameterException exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, exception.getMessage());
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestPartException.class
    })
    ResponseEntity<SanitizedProblemDetail> handleMalformedRequest(Exception exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, "Request validation failed");
    }

    @ExceptionHandler(ProductImageTooLargeException.class)
    ResponseEntity<SanitizedProblemDetail> handleProductImageTooLarge(ProductImageTooLargeException exception) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "Product image is too large", "Product image exceeds the maximum size");
    }

    @ExceptionHandler(ProductImageValidationException.class)
    ResponseEntity<SanitizedProblemDetail> handleProductImageValidation(ProductImageValidationException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid product image", exception.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<SanitizedProblemDetail> handleProductImageTooLarge(MaxUploadSizeExceededException exception) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "Product image is too large", "Product image exceeds the maximum size");
    }

    @ExceptionHandler(ProductImageNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleProductImageNotFound(ProductImageNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product image not found", "Product image was not found");
    }

    @ExceptionHandler(ProductImageStorageException.class)
    ResponseEntity<SanitizedProblemDetail> handleProductImageStorage(ProductImageStorageException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Product image unavailable", "Product image storage is unavailable");
    }

    @ExceptionHandler(AdminProductConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminConflict(AdminProductConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", exception.getMessage());
    }

    @ExceptionHandler(AdminProductNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminNotFound(AdminProductNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product not found", exception.getMessage());
    }

    @ExceptionHandler(AdminProductGroupNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminGroupNotFound(AdminProductGroupNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product group not found", exception.getMessage());
    }

    @ExceptionHandler(FulfillmentConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handleFulfillmentConflict(FulfillmentConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Fulfillment conflict", exception.getMessage());
    }

    @ExceptionHandler(FulfillmentNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleFulfillmentNotFound(FulfillmentNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Fulfillment not found", exception.getMessage());
    }

    @ExceptionHandler(FulfillmentPayloadValidationException.class)
    ResponseEntity<SanitizedProblemDetail> handleFulfillmentPayloadValidation(
            FulfillmentPayloadValidationException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid fulfillment payload", exception.getMessage());
    }

    @ExceptionHandler(FulfillmentSecretConfigurationException.class)
    ResponseEntity<SanitizedProblemDetail> handleFulfillmentSecretConfiguration(
            FulfillmentSecretConfigurationException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Fulfillment unavailable", "Fulfillment encryption is not configured");
    }

    @ExceptionHandler(FulfillmentSecretException.class)
    ResponseEntity<SanitizedProblemDetail> handleFulfillmentSecret(FulfillmentSecretException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Fulfillment unavailable", "Fulfillment secret operation failed");
    }

    @ExceptionHandler(PaymentConfigurationException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentConfiguration(PaymentConfigurationException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Payment service unavailable", "Payment service is not configured");
    }

    @ExceptionHandler(PaymentGatewayException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentGateway(PaymentGatewayException exception) {
        return problem(HttpStatus.BAD_GATEWAY, "Payment gateway unavailable", safePaymentGatewayDetail(exception));
    }

    @ExceptionHandler(PaymentConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentConflict(PaymentConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Payment conflict", exception.getMessage());
    }

    @ExceptionHandler(CartLockedException.class)
    ResponseEntity<SanitizedProblemDetail> handleCartLocked(CartLockedException exception) {
        return problem(HttpStatus.CONFLICT, "Cart is locked", "Cart is locked while a payment is pending");
    }

    @ExceptionHandler(PaymentNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentNotFound(PaymentNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Payment not found", exception.getMessage());
    }

    @ExceptionHandler(PromptPayUnavailableException.class)
    ResponseEntity<SanitizedProblemDetail> handlePromptPayUnavailable(PromptPayUnavailableException exception) {
        return problem(HttpStatus.CONFLICT, "PromptPay temporarily unavailable", "PromptPay is unavailable during the scheduled window");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<SanitizedProblemDetail> handleDataIntegrityConflict(DataIntegrityViolationException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", "Product constraint conflict");
    }

    private static ResponseEntity<SanitizedProblemDetail> problem(
            HttpStatus status,
            String title,
            String detail) {
        SanitizedProblemDetail problem = new SanitizedProblemDetail(
                ABOUT_BLANK,
                title,
                status.value(),
                detail);

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private static String safePaymentGatewayDetail(PaymentGatewayException exception) {
        if (exception.getCause() instanceof RestClientResponseException response) {
            int status = response.getStatusCode().value();
            if (status == 401 || status == 403) return "Payment provider authentication failed";
            if (status == 429) return "Payment provider rate limit reached";
            if (status >= 400 && status < 500) return "Payment provider rejected the request";
            return "Payment provider is unavailable";
        }
        return switch (exception.getMessage()) {
            case "Payment gateway amount does not match order total" -> "Payment amount does not match order total";
            case "Payment gateway amount is invalid" -> "Payment provider returned an invalid amount";
            case "Payment gateway QR URL is not allowed" -> "Payment provider returned an unsupported QR URL";
            case "Payment gateway QR URL is invalid" -> "Payment provider returned an invalid QR URL";
            case "Payment gateway response is incomplete" -> "Payment provider returned an incomplete response";
            case "Payment gateway response is invalid" -> "Payment provider returned an invalid response";
            case "Payment gateway rejected the request" -> "Payment provider rejected the request";
            default -> "Payment provider request failed";
        };
    }

    private record SanitizedProblemDetail(URI type, String title, int status, String detail) {
    }
}
