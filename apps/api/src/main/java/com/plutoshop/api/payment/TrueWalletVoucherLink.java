package com.plutoshop.api.payment;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import com.plutoshop.api.error.InvalidRequestParameterException;

public final class TrueWalletVoucherLink {

    private static final String HOST = "gift.truemoney.com";
    private static final String PATH = "/campaign/";

    private TrueWalletVoucherLink() {
    }

    public static String validate(String value) {
        if (value == null || value.isBlank() || value.length() > 2_000
                || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new InvalidRequestParameterException("TrueWallet voucher link is invalid");
        }
        try {
            URI uri = URI.create(value);
            String query = uri.getRawQuery();
            String[] queryParts = query == null ? new String[0] : query.split("&", -1);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || !HOST.equalsIgnoreCase(uri.getHost())
                    || uri.getPort() != -1
                    || uri.getUserInfo() != null
                    || uri.getRawFragment() != null
                    || !PATH.equals(uri.getPath())
                    || queryParts.length != 1
                    || !queryParts[0].startsWith("v=")
                    || queryParts[0].length() <= 2) {
                throw new InvalidRequestParameterException("TrueWallet voucher link is invalid");
            }
            String token = URLDecoder.decode(queryParts[0].substring(2), StandardCharsets.UTF_8);
            if (token.isBlank() || token.codePoints().anyMatch(Character::isISOControl)
                    || token.codePoints().anyMatch(Character::isWhitespace)) {
                throw new InvalidRequestParameterException("TrueWallet voucher link is invalid");
            }
            String canonical = "https://" + HOST + PATH + "?v=" + encodeQueryComponent(token);
            if (canonical.length() > 2_000) {
                throw new InvalidRequestParameterException("TrueWallet voucher link is invalid");
            }
            return canonical;
        } catch (IllegalArgumentException exception) {
            throw new InvalidRequestParameterException("TrueWallet voucher link is invalid");
        }
    }

    private static String encodeQueryComponent(String value) {
        StringBuilder encoded = new StringBuilder(value.length());
        for (byte current : value.getBytes(StandardCharsets.UTF_8)) {
            int unsigned = current & 0xff;
            if ((unsigned >= 'a' && unsigned <= 'z')
                    || (unsigned >= 'A' && unsigned <= 'Z')
                    || (unsigned >= '0' && unsigned <= '9')
                    || unsigned == '-' || unsigned == '.' || unsigned == '_' || unsigned == '~') {
                encoded.append((char) unsigned);
            } else {
                encoded.append('%');
                encoded.append(Character.toUpperCase(Character.forDigit(unsigned >>> 4, 16)));
                encoded.append(Character.toUpperCase(Character.forDigit(unsigned & 0x0f, 16)));
            }
        }
        return encoded.toString();
    }
}
